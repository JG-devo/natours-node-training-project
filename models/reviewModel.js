const mongoose = require('mongoose');
const Tour = require('./tourModel');

const reviewSchema = new mongoose.Schema(
  {
    review: {
      type: String,
      required: [true, 'Review cannot be empty'],
    },
    rating: {
      type: Number,
      min: [1, 'Review must be more than 1.0'],
      max: [5, 'Review must be 5 or below'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    tour: {
      type: mongoose.Schema.ObjectId,
      ref: 'Tour',
      required: [true, 'Review must belong to a tour'],
    },
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Review must belong to a user'],
    },
  },
  {
    // options object
    toJSON: { virtuals: true }, // required for virtual properties to show on the JSON output
    toObject: { virtuals: true }, // ditto with object output
  }
);

// COMPOUND INDEX SET WITH UNIQUE
// This is how we can prevent the same user from adding more than one review per tour as both the tour and user are combined in one index and set to unique
reviewSchema.index({ tour: 1, user: 1 }, { unique: true });

reviewSchema.pre(/^find/, function (next) {
  // this.populate({
  //   path: 'tour',
  //   select: '-guides name', // order matters with selection
  // }).populate({
  //   path: 'user',
  //   select: 'name photo',
  // }); // removing the tour part as there is a lot of chained populate() methods that can hamper performance

  this.populate({
    path: 'user',
    select: 'name photo',
  });

  next();
});

// STATIC METHOD ON THE SCHEMA
// statics are the methods defined on the Model. Instance methods are defined on the document.
// Can be called on the model directly like this - Review.calcStats
// the 'this' kw in static methods points to the model
// Why static? Because aggregate needs to be called on the model and static points to that
// The function below is for new reviews / existing reviews

reviewSchema.statics.calcAverageRatings = async function (tourId) {
  const stats = await this.aggregate([
    {
      $match: { tour: tourId },
    },
    {
      $group: {
        _id: '$tour',
        nRating: { $sum: 1 },
        avgRating: { $avg: '$rating' },
      },
    },
  ]);
  // console.log(stats);

  if (stats.length > 0) {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsQuantity: stats[0].nRating,
      ratingsAverage: stats[0].avgRating,
    });
  } else {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsQuantity: 0,
      ratingsAverage: 4.5,
    });
  }
};

reviewSchema.post('save', function () {
  // this points to current review, constructor points to the Model that created the review
  // the constructor is needed because Review is only created after this function (and cannot be moved above)
  // Otherwise it would have been Review.calcAverageRatings(this.tour)
  this.constructor.calcAverageRatings(this.tour);
});

// HANDLING UPDATED AND DELETED REVIEWS - AVG RATINGS
// A bit more tricky as update and delete use findByIdAndUpdate and findByIdAndDelete which don't have access to documents
// UPDATE: post does have access to doc, but still interesting to see how data can be passed in middlewares. Here is alternative version for future reference (replaces pre and post hooks below)
// https://www.udemy.com/course/nodejs-express-mongodb-bootcamp/learn/lecture/15065554#questions/13474174
//
// reviewSchema.post(/^findOneAnd/, async function (docs) {
//   await docs.constructor.calcAverageRatings(docs.tour);
// });
//
// We can only use query middleware, not document middleware
// We need to use pre first because it has access to the findOne doc. Post would mean the query has already executed and we can't access

reviewSchema.pre(/^findOneAnd/, async function (next) {
  // Trick to gain access to the document by executing the query, because right now 'this' points to the query
  // https://mongoosejs.com/docs/migrating_to_6.html#duplicate-query-execution
  // Instead of const, we assign the doc to this.review so post can access the data
  this.review = await this.clone().findOne();
  // console.log(this.review);
});

reviewSchema.post(/^findOneAnd/, async function () {
  await this.review.constructor.calcAverageRatings(this.review.tour);
});

const Review = mongoose.model('Review', reviewSchema);
module.exports = Review;
