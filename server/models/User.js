import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  points: {
    type: Number,
    default: 0,
    min: 0
  },
  flips: {
    type: Number,
    default: 0
  },
  twitterFollowed: {
    type: Boolean,
    default: false
  },
  twitterUserId: {
    type: String,
    default: null,
    index: true // Index for faster lookups to prevent duplicate Twitter accounts
  },
  oauthTokenSecret: {
    type: String,
    default: null
  },
  oauthToken: {
    type: String,
    default: null
  },
  referralUsed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export const User = mongoose.model('User', userSchema);

