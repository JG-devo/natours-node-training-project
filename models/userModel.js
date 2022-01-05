const crypto = require('crypto');
const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide your full name'],
  },
  email: {
    type: String,
    required: [true, 'Please provide your email address'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email address'],
  },
  photo: {
    type: String,
    default: 'default.jpg',
  },
  role: {
    type: String,
    enum: ['user', 'guide', 'lead-guide', 'admin'],
    default: 'user',
  },
  password: {
    type: String,
    required: [true, 'Please enter a unique password'],
    minlength: 8,
    select: false, // wont show up in any GET output
  },
  passwordConfirm: {
    type: String,
    required: [true, 'Please re-enter your password to confirm'],
    validate: {
      // This only works on .create() and .save()! Not findOneAndUpdate, etc
      validator: function (el) {
        return el === this.password;
      },
      message: 'Passwords are not the same!',
    },
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  active: {
    type: Boolean,
    default: true,
    select: false,
  },
});

//////////////////////////////////////////////////////////////////////////
// ENCRYPTING PASSWORDS
// bcrypt is an async function

userSchema.pre('save', async function (next) {
  // Only run this function if password was actually modified
  if (!this.isModified('password')) return next();

  // Hash the password with cost of 12
  // number 12 is how many salt rounds, 10 is standard, 12 is a little more safer for brute force
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined; // remove the field and data
  next();
});

//////////////////////////////////////////////////////////////////////////
// VERIFYING PASSWORD (USING INSTANT METHOD) - https://mongoosejs.com/docs/guide.html#methods
// Instance methods are available on a certain collection of documents (userSchema), it can be called on user documents everywhere in the app (no importing needed)
// In this case 'this.password' won't work as we've set select to false in the schema
// Candidate password is the unhashed password passed in by the user (req.body), the user password is the hashed version

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    // console.log(changedTimestamp, JWTTimestamp);
    return JWTTimestamp < changedTimestamp;
  }

  // False means NOT changed
  return false;
};

//////////////////////////////////////////////////////////////////////////
// FORGOT PASSWORD
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex'); // never stored in the DB

  // Store encrypted PW to database
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // console.log({ resetToken }, this.passwordResetToken);

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 mins
  return resetToken; // return the unencrypted PW to send to user that will be compared to encrypted version
};

userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000; // puts it 1 sec in the past to prevent delay that may occur with token creation time
  next();
});

//////////////////////////////////////////////////////////////////////////
// QUERY MIDDLEWARE (FILTERING INACTIVE USERS)
userSchema.pre(/^find/, function (next) {
  // this points to the current query
  this.find({ active: { $ne: false } });
  next();
});

////////////////////////////////////////////////////////////////////////////

const User = mongoose.model('User', userSchema);

module.exports = User;
