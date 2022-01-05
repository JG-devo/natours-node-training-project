const fs = require('fs');
const express = require('express');

const app = express();

//Middleware
app.use(express.json());

////////////////////////////////////////////////////////////////////////
/////// Example code

// app.get('/', (req, res) => {
//   res.status(200).json({ message: 'Hello from the server!', app: 'Natours' });
// });

// app.post('/', (req, res) => {
//   res.send('You can post to this endpoint');
// });

////////////////////////////////////////////////////////////////////////
// Tours Resource

const tours = JSON.parse(
  fs.readFileSync(`${__dirname}/dev-data/data/tours-simple.json`)
);

app.get('/api/v1/tours', (req, res) => {
  //this callback is called the 'route handler'
  res.status(200).json({
    status: 'success',
    results: tours.length,
    data: {
      tours,
    },
  });
});

// The :id is a variable, so any value added to the end of the URL can be seen by looking at req.params
// You specify multiple variables with '/api/v1/tours/:id/:x/:y', and if one of the parameters is optional, then:
// '/api/v1/tours/:id/:x/:y?' -- the y variable can be left out (returns undefined)

app.get('/api/v1/tours/:id', (req, res) => {
  console.log(req.params); // 127.0.0.1:3000/api/v1/tours/5 produces { id: '5' } in console
  const id = +req.params.id;
  const tour = tours.find((el) => el.id === id);

  // if (id > tours.length - 1) {
  if (!tour) {
    return res.status(404).json({
      status: 'fail',
      message: 'Invalid ID',
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      tour,
    },
  });
});

app.post('/api/v1/tours', (req, res) => {
  // console.log(req.body); // Body is available because we're using the middleware

  const newID = tours[tours.length - 1].id + 1;
  const newTour = Object.assign({ id: newID }, req.body);

  tours.push(newTour);
  fs.writeFile(
    `${__dirname}/dev-data/data/tours-simple.json`,
    JSON.stringify(tours), // Have to convert JS object back to JSON
    (err) => {
      res.status(201).json({
        // 201 stands for 'created'
        status: 'success',
        data: {
          tour: newTour,
        },
      });
    }
  );

  // res.send('done'); // always need to send back something
});

app.patch('/api/v1/tours/:id', (req, res) => {
  if (+req.params.id > tours.length - 1) {
    return res.status(404).json({
      status: 'fail',
      message: 'Invalid ID',
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      tour: '<updated tour here...>',
    },
  });
});

app.delete('/api/v1/tours/:id', (req, res) => {
  if (+req.params.id > tours.length - 1) {
    return res.status(404).json({
      status: 'fail',
      message: 'Invalid ID',
    });
  }

  res.status(204).json({
    // 204 means no content
    status: 'success',
    data: null,
  });
});

const port = 3000;
app.listen(port, () => {
  console.log(`App running on port ${port}...`);
});
