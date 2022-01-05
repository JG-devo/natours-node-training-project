const express = require('express');

const userController = require('../controllers/userController');
const authController = require('../controllers/authController');

////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////

// Creating a router as middleware (creating a sub application)
const router = express.Router();

router.post('/signup', authController.signup); // Not RESTful as we're using a specific URL for this task whereas the routes below don't rely on any particular URL to perform an action. This is a very specific route for a very specific purpose
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.post('/forgotPassword', authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);

// Protect all routes after this middleware
router.use(authController.protect); // uses this middleware for all routes below this point (runs in sequence)

router.patch('/updatePassword', authController.updatePassword);
router.get('/me', userController.getMe, userController.getSingleUser);
router.patch(
  '/updateMe',
  userController.uploadUserPhoto,
  userController.resizeUserPhoto,
  userController.updateMe
);
router.delete('/deleteMe', userController.deleteMe);

router.use(authController.restrictTo('admin'));

router
  .route('/')
  .get(userController.getAllUsers)
  .post(userController.createUser);

router
  .route('/:id')
  .get(userController.getSingleUser)
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

module.exports = router;
