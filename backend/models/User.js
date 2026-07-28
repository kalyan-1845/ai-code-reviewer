import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  clientId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  preferredModel: {
    type: String,
    default: 'llama-3.3-70b-versatile',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model('User', userSchema);
