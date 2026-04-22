
// Global objects go here (outside of any functions)
let data, scatterplot, barchart;

const dispatcher = d3.dispatch('filterCategories');

/**
 * Load data from CSV file asynchronously and render charts
 */
d3.csv('data/vancouver_trails.csv')
  .then(_data => {
    data = _data;

    data.forEach(d => {
      d.distance = +d.distance;
      d.time = +d.time;
    });

    const colorScale = d3.scaleOrdinal()
      .domain(['Easy', 'Intermediate', 'Difficult'])
      .range(['#66c2a5', '#fc8d62', '#8da0cb']);

    scatterplot = new Scatterplot({
      parentElement: '#scatterplot',
      colorScale: colorScale
    }, data);
    scatterplot.updateVis();

    barchart = new Barchart({
      parentElement: '#barchart',
      colorScale: colorScale
    }, dispatcher, data);
    barchart.updateVis();
  })
  .catch(error => console.error(error));

dispatcher.on('filterCategories', selectedCategories => {
  if (selectedCategories.length === 0) {
    scatterplot.data = data;
  } else {
    scatterplot.data = data.filter(d =>
      selectedCategories.includes(d.difficulty));
  }
  scatterplot.updateVis();
});
