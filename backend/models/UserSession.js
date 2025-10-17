import mongoose from 'mongoose';

const userSessionSchema = new mongoose.Schema({
  socketId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: String,
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  userColor: {
    type: String,
    required: true
  },
  documentId: {
    type: String,
    required: true
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

userSessionSchema.methods.updateActivity = function() {
  this.lastActive = new Date();
  return this.save();
};

export default mongoose.model('UserSession', userSessionSchema);