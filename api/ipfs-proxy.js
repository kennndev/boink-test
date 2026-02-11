export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { cid } = req.query;

    if (!cid) {
      return res.status(400).json({ error: 'CID parameter is required' });
    }

    // Try multiple IPFS gateways
    const gateways = [
      'https://ipfs.io/ipfs/',
      'https://cloudflare-ipfs.com/ipfs/',
      'https://gateway.pinata.cloud/ipfs/',
      'https://nftstorage.link/ipfs/',
      'https://dweb.link/ipfs/'
    ];

    let lastError = null;

    for (const gateway of gateways) {
      try {
        const url = `${gateway}${cid}`;
        console.log(`Trying gateway: ${url}`);

        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json,image/*,*/*',
          },
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type');

          // For JSON metadata
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            return res.status(200).json(data);
          }

          // For images or other binary content
          const buffer = await response.arrayBuffer();
          res.setHeader('Content-Type', contentType || 'application/octet-stream');
          return res.status(200).send(Buffer.from(buffer));
        }
      } catch (err) {
        lastError = err;
        console.log(`Gateway ${gateway} failed:`, err.message);
        continue;
      }
    }

    return res.status(502).json({
      error: 'All IPFS gateways failed',
      lastError: lastError?.message
    });

  } catch (error) {
    console.error('IPFS proxy error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
