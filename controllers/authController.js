const crypto = require('crypto');
const { promisify } = require('util'); // destructuring the one command from util module
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Email = require('../utils/email');

const signToken = id =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(user._id);

  // https://expressjs.com/en/api.html#res.cookie -- res.cookie(name, value [, options])
  res.cookie('jwt', token, {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    // secure: true, // only using https, enabled when in production via if statement below
    httpOnly: true, // cannot be modified or accessed by the browser in any way
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  });

  user.password = undefined; // remove PW from new user sign up JSON

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

exports.signup = catchAsync(async (req, res) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    passwordChangedAt: req.body.passwordChangedAt,
  });

  const url = `${req.protocol}://${req.get('host')}/me`;
  // console.log(url);
  await new Email(newUser, url).sendWelcome();
  // The JWT Secret should be 32 characters or longer to be secure
  createSendToken(newUser, 201, req, res);
});

exports.login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  // 1) Check if email and password exist
  if (!email || !password) {
    throw new AppError('Please provide email and password!', 400);
  }

  // 2) Check if user exists && password is correct
  // Because password is set to not show by default on the schema, we need to use select and the + symbol to re-add it here
  // the user variable is now a document because its a result of querying the user model
  const user = await User.findOne({ email }).select('+password');

  // the 'correctPassword()' function is in the userModel, and is setup as an instance method on all the user documents.
  if (!user || !(await user.correctPassword(password, user.password))) {
    throw new AppError('Incorrect email or password', 401); // 401 means unauthorized
  }

  // 3) If everything is OK, send token to client
  createSendToken(user, 200, req, res);
});

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: 'success' });
};

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Get the token and check it exists
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1]; // Bearer <jwttoken> -- split into array, and select the token
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  // console.log(token);

  if (!token) {
    throw new AppError(
      'You are not logged in. Please login to get access.',
      401
    );
  }

  // 2) Validate token (verification)
  // verify() method needs the token and the secret to create test signature. The 3rd argument requires a callback, so it verifies the token and then calls the callback (verify() is actually a async function). In order to return a promise (so we can await), we're using the built in node module 'util', and the promisify method.

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  // shorthand syntax, the second () means call the function returned from promisify() immediately
  // console.log(decoded); // shows ID for mongo doc, timestamp for created and expires

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser)
    throw new AppError(
      'The user belonging to this token no longer exists',
      401
    );

  // 4) Check if user changed password after the JWT token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    throw new AppError(
      'User recently changed password! Please log in again.',
      401
    );
  }

  // Grant access to protected route
  req.user = currentUser; // Put the entire user data on the request
  res.locals.user = currentUser;
  next();
});

//////////////////////////////////////////////////////////////////////////////////////////
// CHECK IF USER IS LOGGED IN
// Only for rendered pages, no errors will be produced

exports.isLoggedIn = async (req, res, next) => {
  if (req.cookies.jwt) {
    try {
      // 1) Verifies the token
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET
      );
      // shorthand syntax, the second () means call the function returned from promisify() immediately
      // console.log(decoded); // shows ID for mongo doc, timestamp for created and expires

      // 2) Check if user still exists
      const currentUser = await User.findById(decoded.id);
      if (!currentUser) return next();

      // 3) Check if user changed password after the JWT token was issued
      if (currentUser.changedPasswordAfter(decoded.iat)) return next();

      // There is a logged in user
      // Every pug template will have access to res.locals - so anything we add there can be accessed as a variable on the front end
      res.locals.user = currentUser; // Put the entire user data on the request
      return next();
    } catch (err) {
      return next();
    }
  }
  next();
};

//////////////////////////////////////////////////////////////////////////////////////////
// ASSIGNING USER ROLES
// We can't normally pass in arguments into middleware so we need a wrapper function that returns the middleware function

exports.restrictTo =
  (...roles) =>
  (req, res, next) => {
    // ...roles is an array i.e. ['admin', 'lead-guide']. If the role includes, then next is called
    // req.user was created in the protect() function
    if (!roles.includes(req.user.role)) {
      throw new AppError(
        'You do not have permission to perform this action',
        403
      ); //forbidden err code
    }

    next();
  };

//////////////////////////////////////////////////////////////////////////////////////////
// FORGOT PASSWORD and RESET PASSWORD

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTed email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    throw new AppError('There is no user with that email address.', 404);
  }

  // 2) Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false }); // Otherwise it expects all the additional data required for verification

  // 3) Send it to user's email
  try {
    const resetURL = `${req.protocol}://${req.get(
      'host'
    )}/api/v1/users/resetPassword/${resetToken}`;

    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    throw new AppError(
      'There was an error sending the email. Try again later!',
      500
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
    //Check if password timestamp greater than current date/time, which means it hasn't yet expired
  });

  // 2) If token has not expired, and there is a user, set the new password
  if (!user) {
    throw new AppError('Token is invalid or has expired.', 400);
  }

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // 3) Update changedPasswordAt property for the user (handled by pre-save function in userModel)
  // 4) Log the user in, send JWT
  createSendToken(user, 200, req, res);
});

//////////////////////////////////////////////////////////////////////////////////////////
// UPDATE PASSWORD (CURRENT USER)

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1) Get the user from the collection
  const user = await User.findById(req.user.id).select('+password');

  // 2) Check if POSTed current password is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    throw new AppError('Your current password is incorrect', 401);
  }
  // 3) If so, update password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();
  // 4) Log user in, send JWT
  createSendToken(user, 200, req, res);
});
