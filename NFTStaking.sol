// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/*
    NFTStaking (UUPS Upgradeable) — hardened version

    Goals:
    - No incorrect accounting (counts always match recorded token set)
    - Only the original staker can unstake
    - No token can get trapped by accidental direct transfers
    - CEI + nonReentrant everywhere it matters
    - Implementation contract cannot be initialized (UUPS best practice)
    - Optional: choose pause semantics (configured below)

    IMPORTANT: This contract assumes the NFT is a standard ERC721.
*/

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";

contract NFTStaking is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    ERC721HolderUpgradeable
{
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    IERC721 public stakingNft;

    uint256 public totalStaked;
    uint256 public maxBatch;

    // user => how many staked (must always equal userTokens[user].length())
    mapping(address => uint256) private userStakedCount;

    // tokenId => staker (0 if not staked)
    mapping(uint256 => address) public stakerOf;

    // staker => set(tokenIds)
    mapping(address => EnumerableSet.UintSet) private userTokens;

    // Guard to prevent accidental direct transfers trapping NFTs:
    // we only accept ERC721 transfers when stake() is executing.
    bool private _acceptingStakeTransfers;

    event Staked(address indexed user, uint256[] tokenIds);
    event Unstaked(address indexed user, uint256[] tokenIds);
    event MaxBatchSet(uint256 maxBatch);

    // Admin safety for genuine mistakes (only when token is NOT recorded as staked)
    event RescuedUntracked(address indexed to, uint256 indexed tokenId);
    event RescuedERC20(address indexed token, address indexed to, uint256 amount);
    event RescuedERC721(address indexed nft, address indexed to, uint256 indexed tokenId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address nftAddress, address admin) external initializer {
        require(nftAddress != address(0), "NFT address required");
        require(admin != address(0), "Admin address required");

        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __ERC721Holder_init();

        stakingNft = IERC721(nftAddress);
        maxBatch = 50;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    // ============ Admin ============

    function setMaxBatch(uint256 newMax) external onlyRole(ADMIN_ROLE) {
        require(newMax > 0 && newMax <= 200, "Invalid max batch");
        maxBatch = newMax;
        emit MaxBatchSet(newMax);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Rescue an NFT that was transferred directly to this contract
     *         WITHOUT being staked (i.e., not recorded in stakerOf).
     *
     * Security rules:
     * - only ADMIN_ROLE
     * - only if stakerOf[tokenId] == address(0) (untracked)
     * - must currently be owned by this contract
     */
    function rescueUntracked(uint256 tokenId, address to) external onlyRole(ADMIN_ROLE) nonReentrant {
        require(to != address(0), "Bad receiver");
        require(stakerOf[tokenId] == address(0), "Token is staked");
        require(stakingNft.ownerOf(tokenId) == address(this), "Not held");

        // No internal accounting changes needed because it's not staked.
        stakingNft.safeTransferFrom(address(this), to, tokenId);
        emit RescuedUntracked(to, tokenId);
    }

    /**
     * @notice Rescue ERC20 tokens accidentally sent to this contract.
     */
    function rescueERC20(IERC20 token, address to, uint256 amount) external onlyRole(ADMIN_ROLE) nonReentrant {
        require(to != address(0), "Bad receiver");
        require(amount > 0, "Zero amount");
        token.safeTransfer(to, amount);
        emit RescuedERC20(address(token), to, amount);
    }

    /**
     * @notice Rescue any ERC721 token (other than tracked staking NFTs) sent to this contract.
     *
     * Security rules:
     * - If the NFT is the staking collection, the tokenId must NOT be tracked as staked.
     * - For any other ERC721, transfers freely.
     */
    function rescueERC721(IERC721 nft, uint256 tokenId, address to) external onlyRole(ADMIN_ROLE) nonReentrant {
        require(to != address(0), "Bad receiver");
        if (address(nft) == address(stakingNft)) {
            require(stakerOf[tokenId] == address(0), "Token is staked");
        }
        nft.safeTransferFrom(address(this), to, tokenId);
        emit RescuedERC721(address(nft), to, tokenId);
    }

    // ============ User Actions ============

    function stake(uint256[] calldata tokenIds) external nonReentrant whenNotPaused {
        uint256 count = tokenIds.length;
        require(count > 0, "No tokenIds");
        require(count <= maxBatch, "Too many tokens");

        // Checks: verify ownership and availability
        // Also prevent duplicates in the same batch (cheap O(n^2), but maxBatch <= 200)
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = tokenIds[i];

            require(stakerOf[tokenId] == address(0), "Already staked");
            require(stakingNft.ownerOf(tokenId) == msg.sender, "Not token owner");

            for (uint256 j = i + 1; j < count; j++) {
                require(tokenIds[j] != tokenId, "Duplicate tokenId");
            }
        }

        // Effects: update state BEFORE external calls
        userStakedCount[msg.sender] += count;
        totalStaked += count;

        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = tokenIds[i];
            stakerOf[tokenId] = msg.sender;

            // Make invariants explicit
            require(userTokens[msg.sender].add(tokenId), "Already recorded");
        }

        // Interactions: allow ERC721Receiver only during these transfers
        _acceptingStakeTransfers = true;
        for (uint256 i = 0; i < count; i++) {
            stakingNft.safeTransferFrom(msg.sender, address(this), tokenIds[i]);
        }
        _acceptingStakeTransfers = false;

        // Hard invariant: count must match set length
        require(userTokens[msg.sender].length() == userStakedCount[msg.sender], "Count mismatch");

        emit Staked(msg.sender, tokenIds);
    }

    /**
     * Pause semantics:
     * - If you want "pause blocks staking but allows withdrawals": keep `unstake` WITHOUT whenNotPaused.
     * - If you want "pause freezes everything": add `whenNotPaused` here.
     *
     * This version allows withdrawals during pause (safer operationally).
     */
    function unstake(uint256[] calldata tokenIds) external nonReentrant {
        uint256 count = tokenIds.length;
        require(count > 0, "No tokenIds");
        require(count <= maxBatch, "Too many tokens");

        // Checks + Effects
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = tokenIds[i];

            // Only the original staker can unstake
            require(stakerOf[tokenId] == msg.sender, "Not staker");

            // Strong invariant: must be recorded in the set too (prevents silent desync)
            require(userTokens[msg.sender].contains(tokenId), "Token not recorded");

            stakerOf[tokenId] = address(0);
            require(userTokens[msg.sender].remove(tokenId), "Remove failed");
        }

        userStakedCount[msg.sender] -= count;
        totalStaked -= count;

        // Interactions last
        for (uint256 i = 0; i < count; i++) {
            stakingNft.safeTransferFrom(address(this), msg.sender, tokenIds[i]);
        }

        // Hard invariant: count must match set length
        require(userTokens[msg.sender].length() == userStakedCount[msg.sender], "Count mismatch");

        emit Unstaked(msg.sender, tokenIds);
    }

    // ============ ERC721 Receiver hardening ============

    /**
     * @dev Reject unexpected direct transfers to prevent tokens getting stuck.
     *      Only accept transfers when stake() is executing.
     *
     * Note: safeTransferFrom during unstake() sends from this contract to user,
     *       so onERC721Received is not involved.
     */
    function onERC721Received(
        address operator,
        address /* from */,
        uint256 /* tokenId */,
        bytes memory /* data */
    ) public override returns (bytes4) {
        // Only accept when stake() is actively transferring in
        require(_acceptingStakeTransfers, "Direct transfers disabled");
        // Operator must be this contract (it calls safeTransferFrom in stake())
        require(operator == address(this), "Bad operator");
        return this.onERC721Received.selector;
    }

    // ============ Views ============

    function stakedCount(address user) external view returns (uint256) {
        return userStakedCount[user];
    }

    function stakedTokensOf(address user) external view returns (uint256[] memory) {
        uint256 count = userTokens[user].length();
        uint256[] memory tokens = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            tokens[i] = userTokens[user].at(i);
        }
        return tokens;
    }

    function stakedTokensOfPaginated(address user, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory tokens, uint256 total)
    {
        total = userTokens[user].length();
        if (offset >= total) {
            return (new uint256[](0), total);
        }
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 resultLen = end - offset;
        tokens = new uint256[](resultLen);
        for (uint256 i = 0; i < resultLen; i++) {
            tokens[i] = userTokens[user].at(offset + i);
        }
    }

    function isPaused() external view returns (bool) {
        return paused();
    }

    function getContractInfo()
        external
        view
        returns (
            address stakingNftAddress,
            uint256 totalStakedNfts,
            uint256 maxBatchSize,
            bool contractPaused
        )
    {
        return (address(stakingNft), totalStaked, maxBatch, paused());
    }

    function getStakedCounts(address[] calldata userList) external view returns (uint256[] memory) {
        uint256[] memory counts = new uint256[](userList.length);
        for (uint256 i = 0; i < userList.length; i++) {
            counts[i] = userStakedCount[userList[i]];
        }
        return counts;
    }

    // ============ Internal ============

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {
        require(newImplementation != address(0), "Invalid implementation");
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    uint256[40] private __gap;
}
