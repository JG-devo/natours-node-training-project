// HANDLER FACTORY FUNCTIONS
// Functions that call other functions, reducing the amount of duplicate code in our controllers for CRUD operations

const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const APIFeatures = require('../utils/apiFeatures');

exports.deleteOne = Model =>
  catchAsync(async (req, res) => {
    const doc = await Model.findByIdAndDelete(req.params.id);

    if (!doc) throw new AppError('No document found with that ID', 404);

    res.status(204).json({
      // 204 means no content
      status: 'success',
      data: null,
    });
  });

exports.updateOne = Model =>
  catchAsync(async (req, res) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
      new: true, // This will return the new document with the updates
      runValidators: true,
    });

    if (!doc) throw new AppError('No document found with that ID', 404);

    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.createOne = Model =>
  catchAsync(async (req, res) => {
    // This method is called on the newTour document
    // const newTour = new Tour({});
    // newTour.save();
    // .save() is based on Model.prototype.save() - because newTour is created from the Tour class (instance) giving access to prototypes
    // In this version, we call the method directly on the Tour model itself (works exactly the same way)
    const doc = await Model.create(req.body);

    res.status(201).json({
      // 201 stands for 'created'`
      status: 'success',
      data: {
        data: doc,
      },
    });
    // try {

    // } catch (err) {
    //   res.status(400).json({
    //     status: 'fail',
    //     message: err,
    //   });
    // }

    // const newID = tours[tours.length - 1].id + 1;
    // const newTour = Object.assign({ id: newID }, req.body);

    // tours.push(newTour);
    // fs.writeFile(
    //   `${__dirname}/../dev-data/data/tours-simple.json`,
    //   JSON.stringify(tours), // Have to convert JS object back to JSON
    //   (err) => {}
    // );
  });

exports.getOne = (Model, populateOptions) =>
  catchAsync(async (req, res, next) => {
    // console.log(req.params);
    // const id = +req.params.id;
    // const tour = tours.find((el) => el.id === id);

    // called 'id' because that is what we have in the route i.e. /:id
    // Same as mongosh: Tour.findOne({ _id: req.params.id })
    // populate() guides is used for referencing documents linked to ID in the TourModel schema (see query middleware in tourModel)
    // populating the reviews is referencing a virtual populate function in the tourModel

    let query = Model.findById(req.params.id);
    if (populateOptions) query = query.populate(populateOptions);
    const doc = await query;
    // .populate({ path: 'guides', select: '-__v -passwordChangedAt'}); // moved to query middleware in tourController

    // ID with only one character changed shows success / doc = null. So the below solves that issue
    if (!doc) throw new AppError('No document found with that ID', 404);

    res.status(200).json({
      status: 'success',
      data: {
        data: doc,
      },
    });
  });

exports.getAll = Model =>
  catchAsync(async (req, res) => {
    // To allow for nested GET reviews on Tour (hack for getAllReviews)
    let filter = {};
    if (req.params.tourId) filter = { tour: req.params.tourId };

    // this callback is called the 'route handler'
    // See notes 'before refactoring 'getAllTours' at bottom of page
    // EXECUTE THE QUERY
    const features = new APIFeatures(Model.find(filter), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    // We await the query because we are chaining together different methods similar to query.sort().filter().skip() etc
    // adding .explain() to the end of the mongooseQuery shows a lot of useful query stats like returned vs totalDocsExamined, etc
    // const doc = await features.mongooseQuery.explain();

    const doc = await features.mongooseQuery;

    // SEND RESPONSE
    res.status(200).json({
      status: 'success',
      results: doc.length,
      data: {
        data: doc,
      },
    });
  });
