const express = require('express');
const reviewController = require('../controllers/reviewController');
const authController = require('../controllers/authController');

// MergeParams accepts the /:tourId params being passed in from the tour router (when provided)
const router = express.Router({ mergeParams: true });

// Whether we POST      a request like this: POST /tour/234utri343/reviews or POST /reviews - it will all end up in the router below

router.use(authController.protect);

router
  .route('/')
  .get(reviewController.getAllReviews)
  .post(
    authController.restrictTo('user'),
    reviewController.setTourUserIds,
    reviewController.createReview
  );

router
  .route('/:id')
  .get(reviewController.getOneReview)
  .patch(
    authController.restrictTo('user', 'admin'),
    reviewController.updateReview
  )
  .delete(
    authController.restrictTo('user', 'admin'),
    reviewController.deleteReview
  );

module.exports = router;
