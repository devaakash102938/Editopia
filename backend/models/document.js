import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const documentSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => uuidv4()
  },
  title: {
    type: String,
    default: 'Untitled Document'
  },
  content: {
    type: String,
    default: '<p>Start collaborating on your document...</p>'
  },
  owner: {
    type: String,
    required: true
  },
  collaborators: [{
    userId: String,
    role: {
      type: String,
      enum: ['viewer', 'editor', 'owner'],
      default: 'editor'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  lastSaved: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

documentSchema.pre('save', function(next) {
  this.lastSaved = new Date();
  next();
});

export default mongoose.model('Document', documentSchema);