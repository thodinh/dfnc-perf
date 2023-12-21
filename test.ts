import Perf from './index';

var perf1 = new Perf();
perf1.minMax = true;

for (var idx = 0; idx < 100; idx++) {
	perf1.begin('load_data');
		// do something loady
	perf1.end('load_data');

	perf1.begin('save_data');
		// do something savey
	perf1.end('save_data');
}
console.log("Perf getMinMaxMetrics: ", perf1.getMinMaxMetrics());




var perf2 = new Perf();
var tracker = perf2.begin('something'); // begin measuring 'something'
setTimeout( function() {
	// one second later...
	tracker.end(); // done with something
	
	perf2.end(); // end all tracking
	console.log("Perf Metrics: ", perf2.json());
}, 1000 );