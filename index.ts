export class PerfMetric {
    perf;
    id = '';
    start = 0;
    constructor(perf, id, start) {
        // class constructor
        this.perf = perf;
        this.id = id;
        this.start = start;
    }
    end() {
        // end tracking
        return this.perf.end(this.id, this.start);
    }
    
}

export default class Perf {
    perf;
    counters;
    scale = 1000;
    precision = 1000;
    totalKey = 'total';
    minMax = false;
    
    constructor() {
        // class constructor
        this.reset();
    }
    
    reset() {
        // reset everything
        this.perf = {};
        this.counters = {};
    }
    
    setScale(scale) { 
        // set scale for time measurements
        // 1000000000 == nanoseconds
        // 1000000 == microseconds
        // 1000 == milliseconds
        // 1 == seconds
        this.scale = scale; 
    }
    
    setPrecision(precision) {
        // set precision for measurements
        // 1 == integers only
        // 10 == 1 digit after the decimal
        // 100 == 2 digits after the decimal
        // 1000 == 3 digits after the decimal
        this.precision = precision; 
    }
    
    calcElapsed(start) {
        // calculate elapsed time using process.hrtime() (nanoseconds)
        // then convert to our scale and precision
        var diff = process.hrtime( start );
        var nano = diff[0] * 1e9 + diff[1];
        
        // apply scale transform
        var value = nano / (1000000000 / this.scale);
        
        return value;
    }
    
    begin(id): any {
        // begin tracking metric
        // ID defaults to 't' for total
        if (!id) id = this.totalKey;
        var now = process.hrtime();
        
        // only allow 't' begin to be called once per object (unless it is reset)
        if ((id == this.totalKey) && this.perf[id]) return;
        
        // set start time
        if (!this.perf[id]) this.perf[id] = { elapsed: 0 };
        this.perf[id].start = now;
        if (this.perf[id].end) delete this.perf[id].end;
        
        return new PerfMetric(this, id, now);
    }
    
    end(id?, start?) {
        // mark end of metric
        // ID defaults to 't' for total
        if (!id) id = this.totalKey;
        var now = process.hrtime();
        
        if (!this.perf[id] && !start) return;
        if (!this.perf[id]) this.perf[id] = { elapsed: 0 };
        var obj = this.perf[id];
        
        if (start) obj.start = start;
        obj.end = now;
        if (!obj.start) obj.start = obj.end;
        
        var elapsed = Array.isArray(obj.start) ? 
            this.calcElapsed( obj.start ) : 0;
        
        if (id == this.totalKey) {
            // end of all tracking
            // set elapsed instead of incrementing, to prevent bugs with calling end() twice.
            obj.elapsed = elapsed;
        }
        else {
            // stopped tracking single metric
            // increment elapsed to allow for multiple trackings on same metric
            obj.elapsed += elapsed;
        }
        
        if (this.minMax) {
            if (!obj.count || (elapsed < obj.min)) obj.min = elapsed;
            if (!obj.count || (elapsed > obj.max)) obj.max = elapsed;
            if (!obj.count) obj.count = 0;
            obj.count++;
        }
        
        return this.formatValue(elapsed);
    }
    
    count(id, amount) {
        // increment (or decrement) simple counter, unrelated to time measurement
        if (typeof(amount) == 'undefined') amount = 1;
        if (!(id in this.counters)) this.counters[id] = amount;
        else this.counters[id] += amount;
    }
    
    metrics() {
        // get all perf metrics and counters in simple object format
        var out: any = {};
        
        // make sure total metric is ended
        this.end();
        
        // generate object containing only elapsed times of each
        for (var id in this.perf) {
            if (this.perf[id].end) {
                out[id] = this.elapsed(id, true);
            }
        }
        
        return {
            scale: this.scale,
            perf: out,
            counters: this.counters
        };
    }
    
    json() {
        // return a JSON string with perf metrics and counters separated out
        return JSON.stringify( this.metrics() );
    }
    
    summarize(prefix) {
        // Summarize performance metrics in query string format
        var pairs: string[] = [];
        var metrics = this.metrics();
        if (!prefix) prefix = '';
        
        // start with scale
        pairs.push( 'scale=' + this.scale );
        
        // make sure total is always right after scale
        pairs.push( 'total=' + metrics.perf.total );
        delete metrics.perf.total;
        
        // build summary string of other metrics
        for (var id in metrics.perf) {
            pairs.push( prefix + id + '=' + metrics.perf[id] );
        }
        
        // add counters if applicable, prefix each with c_
        for (var id in metrics.counters) {
            var disp_id = id.match(/^c_/) ? id : ('c_'+id);
            pairs.push( disp_id + '=' + metrics.counters[id] );
        }
        
        return pairs.join('&');
    }
    
    elapsed(id, disp) {
        // get elapsed seconds from given metric
        if (!id) id = this.totalKey;
        if (!this.perf[id]) return 0;
        
        var obj = this.perf[id];
        var elapsed = obj.elapsed || 0;
        
        if (!elapsed && obj.start && !obj.end) {
            // perf is still in progress -- return current elapsed
            elapsed = this.calcElapsed( obj.start );
        }
        
        return disp ? this.formatValue(elapsed) : elapsed;
    }
    
    get() {
        // Get raw perf object
        return this.perf;
    }
    
    getCounters() {
        // Get raw counters object
        return this.counters;
    }
    
    formatValue(value) {
        // format value according to our precision
        return Math.floor(value * this.precision) / this.precision;
    }
    
    getMinMaxMetrics() {
        // get min/max/avg/count/total for each named metric (omits total)
        // special 'minMax' mode must be enabled
        if (!this.minMax) return {};
        var metrics = {};
        
        for (var id in this.perf) {
            var obj = this.perf[id];
            if (obj.end && (id != this.totalKey)) {
                if (!obj.elapsed) obj.elapsed = 0;
                metrics[id] = {
                    min: this.formatValue( obj.min || 0 ),
                    max: this.formatValue( obj.max || 0 ),
                    total: this.formatValue( obj.elapsed ),
                    count: obj.count || 0,
                    avg: this.formatValue( obj.elapsed / (obj.count || 1) )
                };
            }
        }
        
        return metrics;
    }
    
    import(perf, prefix) {
        // import perf metrics from another object (and adjust scale to match)
        // can be a pixl-perf instance, or an object from calling metrics()
        if (!prefix) prefix = '';
        
        if (perf.perf) {
            for (var key in perf.perf) {
                if (key != this.totalKey) {
                    var pkey = prefix + key;
                    if (!this.perf[pkey]) this.perf[pkey] = {};
                    if (!this.perf[pkey].end) this.perf[pkey].end = 1;
                    if (!this.perf[pkey].elapsed) this.perf[pkey].elapsed = 0;
                    var elapsed = (typeof(perf.perf[key]) == 'number') ? perf.perf[key] : perf.perf[key].elapsed;
                    this.perf[pkey].elapsed += (elapsed / (perf.scale / this.scale)) || 0;
                    
                    if (this.minMax && perf.minMax) {
                        // both source and dest have minMax, so import entire min/max/count
                        var adj_min = perf.perf[key].min / (perf.scale / this.scale);
                        if (!this.perf[pkey].count || (adj_min < this.perf[pkey].min)) this.perf[pkey].min = adj_min;
                        
                        var adj_max = perf.perf[key].max / (perf.scale / this.scale);
                        if (!this.perf[pkey].count || (adj_max > this.perf[pkey].max)) this.perf[pkey].max = adj_max;
                        
                        if (!this.perf[pkey].count) this.perf[pkey].count = 0;
                        this.perf[pkey].count += perf.perf[key].count || 0;
                    } // minMax
                    else if (this.minMax) {
                        // source has no minMax, but dest does, so just import their elapsed as one measurement
                        var adj_elapsed = (elapsed / (perf.scale / this.scale)) || 0;
                        if (!this.perf[pkey].count || (adj_elapsed < this.perf[pkey].min)) this.perf[pkey].min = adj_elapsed;
                        if (!this.perf[pkey].count || (adj_elapsed > this.perf[pkey].max)) this.perf[pkey].max = adj_elapsed;
                        if (!this.perf[pkey].count) this.perf[pkey].count = 0;
                        this.perf[pkey].count++;
                    }
                } // not totalKey
            } // foreach perf
        } // perf.perf
        
        if (perf.counters) {
            for (var key in perf.counters) {
                var pkey = prefix + key;
                this.count( pkey, perf.counters[key] );
            }
        }
    }
}
