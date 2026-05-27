export namespace main {
	
	export class Horse {
	    horse_no: string;
	    name: string;
	    age: string;
	    sire: string;
	    dam: string;
	    weight: string;
	    jockey: string;
	    owner: string;
	    trainer: string;
	    st: string;
	    agf: string;
	    h: string;
	    last6: string;
	    kgs: string;
	    s20: string;
	    best_rating: string;
	
	    static createFrom(source: any = {}) {
	        return new Horse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.horse_no = source["horse_no"];
	        this.name = source["name"];
	        this.age = source["age"];
	        this.sire = source["sire"];
	        this.dam = source["dam"];
	        this.weight = source["weight"];
	        this.jockey = source["jockey"];
	        this.owner = source["owner"];
	        this.trainer = source["trainer"];
	        this.st = source["st"];
	        this.agf = source["agf"];
	        this.h = source["h"];
	        this.last6 = source["last6"];
	        this.kgs = source["kgs"];
	        this.s20 = source["s20"];
	        this.best_rating = source["best_rating"];
	    }
	}
	export class Leg {
	    leg_number: number;
	    predictions: number[];
	    winner_horse: number;
	
	    static createFrom(source: any = {}) {
	        return new Leg(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.leg_number = source["leg_number"];
	        this.predictions = source["predictions"];
	        this.winner_horse = source["winner_horse"];
	    }
	}
	export class Prediction {
	    id: number;
	    date: string;
	    city: string;
	    race_time: string;
	    is_completed: boolean;
	    // Go type: time
	    created_at: any;
	    legs: Leg[];
	
	    static createFrom(source: any = {}) {
	        return new Prediction(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.date = source["date"];
	        this.city = source["city"];
	        this.race_time = source["race_time"];
	        this.is_completed = source["is_completed"];
	        this.created_at = this.convertValues(source["created_at"], null);
	        this.legs = this.convertValues(source["legs"], Leg);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Race {
	    race_name: string;
	    time: string;
	    condition: string;
	    age_group: string;
	    distance: string;
	    horses: Horse[];
	
	    static createFrom(source: any = {}) {
	        return new Race(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.race_name = source["race_name"];
	        this.time = source["time"];
	        this.condition = source["condition"];
	        this.age_group = source["age_group"];
	        this.distance = source["distance"];
	        this.horses = this.convertValues(source["horses"], Horse);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RaceProgram {
	    city: string;
	    date: string;
	    races: Race[];
	
	    static createFrom(source: any = {}) {
	        return new RaceProgram(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.city = source["city"];
	        this.date = source["date"];
	        this.races = this.convertValues(source["races"], Race);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateResult {
	    updateAvailable: boolean;
	    currentVersion: string;
	    latestVersion: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.updateAvailable = source["updateAvailable"];
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.message = source["message"];
	    }
	}

}

