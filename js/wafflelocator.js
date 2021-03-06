﻿// TODO: allow choice of distance vs duration
// TODO: display name/address/hours of selected cart, add marker to map
// TODO: allow choice of mode of travel
// TODO: cleanup/refactor!

// This module concerns itself with the location data from Wafels and Dinges
var WaffleLocatorModule = {
    storage_id: "Waffle_Locator",
    allPlacesArray: [],
    // Constructs a waffle place object and adds it to allPlacesArray
    makeWafflePlace: function(spec) {
        var that = {};
        that.get_address = function () {
            return spec.address || '';
        };
        that.get_name = function () {
            return spec.name || '';
        };
        that.get_hours = function () {
            return spec.hours || '';
        };
        return that;
    },

    supports_html5_storage: function() {
        try {
            return 'localStorage' in window && window['localStorage'] !== null;
        } catch (e) {
            return false;
        }
    },

    saveWaffleInfo: function saveWaffleInfo() {
        var counter;
        
        if (!this.supports_html5_storage() || !this.allPlacesArray.length) {
            return false;
        }

        localStorage.removeItem(this.storage_id);

        var wafelInfo = {
          lastUpdate: new Date().toString(),
          places: this.allPlacesArray.map(function(place) {
              return {  
                name: place.get_name(),
                address:  place.get_address(),
                hours:  place.get_hours()
              };
          })
        };

        localStorage.setItem(this.storage_id, JSON.stringify(wafelInfo));
        return true;
    },

    loadWaffleInfo: function loadWaffleInfo() {
        if (!this.supports_html5_storage() || !localStorage.getItem(this.storage_id)) {
            return false;
        }

        var wafelInfo = JSON.parse(localStorage.getItem(this.storage_id));
        var savedDate = new Date(wafelInfo.lastUpdate); 
        var currentDate = new Date();
        if ( (savedDate.getDate() !== currentDate.getDate()) || (savedDate.getHours() !== currentDate.getHours()) ) {
            return false;
        }

        var index,
            numPlaces = wafelInfo.places.length,
            placeName, placeAddress, placeHours,
            spec;

        // Clear our allPlacesArray
        this.allPlacesArray = [];

        var that = this;
        this.allPlacesArray = wafelInfo.places.map(function(place) {
            return that.makeWafflePlace(place);
        });

        return this.allPlacesArray;
    },

    getWDData: function() {
    // GETs all locations for TODAY
    // NOTE: in order to specify date, kinds of locations, and time, must use the POST version
        var yqlQuery = "select * from json where url=",
            baseURL = "'http://www.wafelsanddinges.com/trucks/searchtrucks.php'",
            fullURL = yqlQuery + baseURL;

        $.YQL(fullURL, function (data) {
            if (data.query.count) {
                var jsonData = data.query.results.json;
                if (jsonData.MSG === 'OK') {
                    WaffleLocatorModule.parseWDJSON(jsonData);
                    WaffleLocatorModule.saveWaffleInfo();

                    //console.log("Publishing dataParsed...");
                    //console.log(WaffleLocatorModule.allPlacesArray);
                    $.publish("dataParsed", WaffleLocatorModule.allPlacesArray);

                } else {
                    //console.log("Could not get waffle truck data (GET)!");
                    // use cached data if it exists
					$.publish("dataGetFailed", "Today - bad results");
                }
            } else {
                //console.log("Could not get waffle truck data (GET-from YQL)!");
                // use cached data if it exists
				$.publish("dataGetFailed", "Today");
            }
        });
    },

    postWDData: function(selDate, selTime, selLocType) {
        //console.log("Doing an HTTP POST to get data for selected date, time, and location types");
        // selectedTruck -> 0 = all, 1 = trucks, 2 = carts, 3 = stores
        // selectedTme -> 5 = morning, >5 = evening
        // selectedDate -> date string
        var yqlQuery = "select * from jsonpost where url=",
            baseURL = "http://www.wafelsanddinges.com/trucks/searchtrucks.php",
            //selectedDate = "9/27/2013",
            //selectedTime = ">5",
            selectedDate = selDate.replace(/-/g, '/'),
            selectedTime = selTime,
            selectedTruck = 0,
            postData = "date=" + selectedDate + "&time=" + selectedTime + "&truck_id=" + selectedTruck,
            constructedURL = "'" + baseURL + "' and postdata='" + postData + "'",
            fullURL = yqlQuery + constructedURL;

        /*var yqlQuery = "select * from json where url=",
         baseURL = "http://www.wafelsanddinges.com/trucks/searchtrucks.php",
         selectedDate = "Today",
         selectedTime = 5,
         selectedTruck = 0,
         constructedURL = "'" + baseURL + "?date=" + selectedDate + "&time=" + selectedTime + "&truck_id=" + selectedTruck + "&truckaddress=" + "'",
         fullURL = yqlQuery + constructedURL;*/

        //console.log(fullURL); // "select * from json where url='http://www.wafelsanddinges.com/trucks/searchtrucks.php?date=Today&time=5&truck_id=0&truckaddress='"
        //var realURL = "select * from json where url='http://www.wafelsanddinges.com/trucks/searchtrucks.php?date=Today&time=5&truck_id=0&truckaddress='";

        $.YQL(fullURL, function (data) {
            //console.log(data);
            if (data.query.count) {
                var jsonData = data.query.results.postresult.json;
                if (jsonData.MSG === 'OK') {
                    WaffleLocatorModule.parseWDJSON(jsonData);

                    //console.log("Publishing dataParsed...");
                    //console.log(WaffleLocatorModule.allPlacesArray);
                    $.publish("dataParsed", WaffleLocatorModule.allPlacesArray);

                } else {
                    //console.log("Could not get waffle truck data (POST)!");
                    // use cached data if it exists
					var errorText = selectedDate + " - bad results";
					$.publish("dataGetFailed", errorText);
                }
            } else {
                //console.log("Could not get waffle truck data (POST-from YQL)!");
                $.publish("dataGetFailed", selectedDate);
            }
        });
    },

    parseWDJSON: function(jsonData, callback) {
            var waffleFuncs,
                splittedIndex,
                splitString,
                splitArgs,
                splittedFuncs,
                regTrim,
                regBr;

            var testName, testAddress, testDayHours, spec;

            waffleFuncs = jsonData.FUNCS;

            splittedFuncs = waffleFuncs.split("showAddress");

            // Regular expression to trim " '" at start of each entry in splittedFuncs
            regTrim = /^\s+'|\s+$/g;

            // Regular expression to cut off from '<br>' and onward in the testDayHours entry in splittedFuncs
            regBr = /<br>.+/;

            // Clear our allPlacesArray
            WaffleLocatorModule.allPlacesArray = [];

            // skip 0th index since it is empty
            for (splittedIndex = 1; splittedIndex < splittedFuncs.length; splittedIndex++) {
                splitString = splittedFuncs[splittedIndex];
                splitArgs = splitString.split("',");

                testName = splitArgs[2].replace(regTrim, '');
                testAddress = splitArgs[1].replace(regTrim, '');
                // Set any address that doesn't start with a letter or number to empty
                if (testAddress.match(/^[^A-Za-z0-9]/)) {
                    testAddress = '';
                }
                testDayHours = splitArgs[3].replace(regTrim, '').replace(regBr, '');

                spec = {
                    name: testName,
                    address: testAddress,
                    hours: testDayHours
                };

                //console.log(spec);
                this.allPlacesArray.push(WaffleLocatorModule.makeWafflePlace(spec));
            }
        }
};

// jQuery plugin by James Padolsey for YQL scraping to get JSON data
// http://james.padolsey.com/javascript/using-yql-with-jsonp/
$.YQL = function (query, callback) {

    if (!query || !callback) {
        throw new Error('$.YQL(): Parameters may be undefined');
    }

    var encodedQuery = encodeURIComponent(query.toLowerCase()),
        url = 'http://query.yahooapis.com/v1/public/yql?q='
               + encodedQuery + '&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&callback=?';

    $.getJSON(url, callback).success(function () {
            //alert('success');
        }).error(function () {
            console.log('Failed to getJSON');
        });

};

// This module concerns itself with plotting given destination data for map and directions
var PlotterModule = {
    map: {},    
    directionsDisplay: {},
    directionsService: {},
    geocoder: {},
    boundsTruck: {},
    currentBounds: null,
    markerArray: [],
    markerBounds: [],
    destinationIndices: [],
    selectedDestination: {},
    initialize: function() {
        this.map = new google.maps.Map(document.getElementById('map-canvas'));

        var rendererOptions = {
            map: this.map
        };

        this.directionsDisplay = new google.maps.DirectionsRenderer(rendererOptions);

        this.directionsDisplay.setPanel(document.getElementById("directionsPanel"));

        this.directionsService = new google.maps.DirectionsService();

        this.geocoder =  new google.maps.Geocoder();

        this.boundsTruck = new google.maps.LatLngBounds();

        var manhattan = new google.maps.LatLng(40.7711329, -73.9741874);
        var newYork = new google.maps.LatLng(40.69847032728747, -73.9514422416687);
        var browserSupportFlag = false;

        function handleNoGeolocation(errorFlag) {
            var initialLocation;
            if (errorFlag === true) {
                console.log("Geolocation service failed.");
                initialLocation = newYork;
                /*var lat = 40.7711329;
                var long = -73.9741874;
                var startAddress = lat.toString() + ', ' + long.toString();
                $('#startLocation').val(startAddress);        */
            } else {
                console.log("Your browser doesn't support geolocation.");
                initialLocation = manhattan;
            }
            PlotterModule.map.setCenter(initialLocation);
            PlotterModule.map.setZoom(13);
        }
        // The success callbacks are only called when the HTML page is hosted on a web server and not from a filesystem
        // Try W3C Geolocation (Preferred)
        if (navigator.geolocation) {
            browserSupportFlag = true;
            navigator.geolocation.getCurrentPosition(function (position) {
                    var lat = position.coords.latitude;
                    var long = position.coords.longitude;
                    var startAddress = lat.toString() + ', ' + long.toString();
                    $('#startLocation').val(startAddress);

                    var initialLocation = new google.maps.LatLng(lat, long);
                    console.log("Setting current position based on geolocator " + initialLocation);
                    //PlotterModule.map.setCenter(initialLocation);
                }, function (error) {
                    console.log(error);
                    handleNoGeolocation(browserSupportFlag);
                },
                { timeout: 5000 });
        }
        // Browser doesn't support Geolocation
        else {
            browserSupportFlag = false;
            handleNoGeolocation(browserSupportFlag);
        }

    },
    calcRoute: function(theOrigin, theDestination, travelMode) {
        /*var travelModeSelected = google.maps.DirectionsTravelMode.TRANSIT;

        if (travelMode === 'driving') {
            travelModeSelected = google.maps.DirectionTravelMode.DRIVING;
        } else if (travelMode === 'bicycling') {
            travelModeSelected = google.maps.DirectionsTravelMode.BICYCLING;
        } else if (travelMode === 'walking') {
            travelModeSelected = google.maps.DirectionsTravelMode.WALKING;
        }         */

        var request = {
            origin: theOrigin,
            destination: theDestination,
            travelMode: travelMode,
            provideRouteAlternatives: true
        };

        this.directionsService.route(request, function (response, status) {
            if (status == google.maps.DirectionsStatus.OK) {
                //console.log(response);
                $.publish("gotDirections");
                PlotterModule.directionsDisplay.setDirections(response);
                // If we have selected a marker, extend the map to cover it
                if (PlotterModule.currentBounds) {
                    PlotterModule.boundsTruck.extend(PlotterModule.currentBounds);
                    PlotterModule.map.fitBounds(PlotterModule.boundsTruck);
                }
            }
        });
    },
    showAllTruckMarkers: function(placesArray) {
        // First, clear out any existing markerArray from previous calculations.
        for (i = 0; i < this.markerArray.length; i++) {
            this.markerArray[i].setMap(null);
        }
        this.markerArray = [];
        this.markerBounds = [];

        for (var i = 0; i < placesArray.length; i++) {
            var theAddress = placesArray[i].get_address();
            var theName = placesArray[i].get_name();
            var theHours = placesArray[i].get_hours();
            var specs = {
                name: theName,
                address: theAddress,
                hours: theHours,
                placeIndex: i
            };
            this.showTruckMarker(specs, placesArray);
        }
    },
    showTruckMarker: function(specs, placesArray) {
        if (specs.address) {
            this.geocoder.geocode({ 'address': specs.address }, function (results, status) {
                if (status == google.maps.GeocoderStatus.OK) {
                    PlotterModule.markerBounds.push(results[0].geometry.location);

                    PlotterModule.boundsTruck.extend(results[0].geometry.location);
                    PlotterModule.map.fitBounds(PlotterModule.boundsTruck);

                    PlotterModule.map.setCenter(results[0].geometry.location);

                    if (!specs.name) {
                        //console.log("Current spec has no name, placeIndex: " + specs.placeIndex);
                    } else {
                        var cont = specs.name + ", " + specs.address + ", " + specs.hours;
                        //console.log(specs);
                        var infowindow = new google.maps.InfoWindow({
                            content: cont
                        });

                        var image = new google.maps.MarkerImage('images/truck_icon.png',
                            new google.maps.Size(100, 67),
                            new google.maps.Point(0, 0),
                            new google.maps.Point(0, 35));

                        var marker = new google.maps.Marker({
                            map: PlotterModule.map,
                            icon: image,
                            title: specs.name,
                            position: results[0].geometry.location
                        });

                        PlotterModule.markerArray.push(marker);
                        placesArray[specs.placeIndex].markerIndex = PlotterModule.markerArray.length - 1;
                        //console.log("Adding marker index " + (PlotterModule.markerArray.length - 1) + "for place " + specs.placeIndex) ;

                        var openWindow = function () {
                            var infoBox = new google.maps.InfoWindow({
                                position: results[0].geometry.location,
                                content: cont
                            });
                            return (function () {
                                infoBox.open(PlotterModule.map, marker);
                            });
                        }();

                        google.maps.event.addListener(marker, 'click', function (data) {
                            openWindow();
                            if (typeof data === 'string' && data === 'suppress') {
                                //console.log("Not updating place info");
                            } else {
                                PlotterModule.updateSelectedPlaceInfo(specs.placeIndex, placesArray);
                            }
                        });
                    }
                }
            })
        }
    },
    updateSelectedPlaceInfo: function(selectedIndex, placesArray) {
        $('#cartSelect').val(selectedIndex);

        var selectedMarkerIndex = placesArray[selectedIndex].markerIndex;
        var placeName = placesArray[selectedIndex].get_name();
        var placeHours = placesArray[selectedIndex].get_hours();
        var placeAddress = placesArray[selectedIndex].get_address();

        //$('#infoBlock').html('<div style="margin-left:12px;margin-top: -32px;"><br><br><font style="font-family: WhitneyB; color: #c4a065; font-size: 18px; font-weight: 100;"><b>' + placeName + '</b></font><br><font style="font-family:Whitney-Book; font-size: 14px; color: #173641;">' + placeHours + '</font></div>');
        $('#infoBlock').html('<strong>' + placeName + '</strong><br>' + placeAddress + '<br>' + placeHours )
        //console.log("Selected marker index: " + selectedMarkerIndex);
        if (selectedMarkerIndex || selectedMarkerIndex === 0) {
            var selectedMarker = this.markerArray[selectedMarkerIndex];
            var markerPos = selectedMarker.getPosition();

            this.currentBounds = this.markerBounds[selectedMarkerIndex];

            new google.maps.event.trigger(selectedMarker, 'click', 'suppress');
            this.map.setCenter(markerPos);
            this.map.setZoom(15);
            //console.log(selectedMarker.getTitle());
            this.selectedDestination = placesArray[selectedIndex].get_address();

            //console.log("Setting end location to " + this.selectedDestination);
            $('#endLocation').val(this.selectedDestination);
        }
    }

};


/* jQuery Tiny Pub/Sub - v0.7 - 10/27/2011
 * http://benalman.com/
 * Copyright (c) 2011 "Cowboy" Ben Alman; Licensed MIT, GPL */
(function($) {

    var o = $({});

    $.subscribe = function() {
        o.on.apply(o, arguments);
    };

    $.unsubscribe = function() {
        o.off.apply(o, arguments);
    };

    $.publish = function() {
        o.trigger.apply(o, arguments);
    };

}(jQuery));

$(function () {
    console.log('Loaded and supports storage is ' + WaffleLocatorModule.supports_html5_storage());

    if (navigator.geolocation) {
        $('#currentLocator').click(function() {
            $('#alertGroup').hide();
            navigator.geolocation.getCurrentPosition(function (position) {
                var lat = position.coords.latitude;
                var long = position.coords.longitude;
                var startAddress = lat.toString() + ', ' + long.toString();
                $('#startLocation').val(startAddress);

                var initialLocation = new google.maps.LatLng(lat, long);
                console.log("Setting current position based on geolocator " + initialLocation);

                }, function (error) {
                    //console.log(error);
                    var errorDict = {
                        1: 'Permission denied',
                        2: 'Position unavailable',
                        3: 'Request timeout'
                    };

                    $('#alertMessage').text("Failed to get current location: " + errorDict[error.code]);
                    $('#alertGroup').show();
                },
                { timeout: 5000 });
        });
    }
    else {
        $('#currentLocator').hide();
    }

    // Alert messages
    $('#alertGroup').hide();
    //$('#progBar').hide();

    // Directions button
    $('#showDirections').hide();

    $('.selectpicker').selectpicker();

    var nowTemp = new Date();
    var now = new Date(nowTemp.getFullYear(), nowTemp.getMonth(), nowTemp.getDate(), 0, 0, 0, 0);

    var dp = $('#dp3').datepicker({format: 'mm-dd-yyyy'}).data('datepicker');
    dp.setValue(nowTemp);

   /* var fullDate = now.getMonth() + "-" + now.getDay() + "-" + now.getFullYear();
    console.log(now);
    WaffleLocatorModule.dateString = fullDate;       */

    PlotterModule.initialize();
    $.subscribe("dataParsed", function(event, locationsT) {
        //console.log(arguments);
        var locButton = $(document.getElementById('finder'));
        locButton.button('reset');

        $('#progBar').hide();

        var locations = Array.prototype.slice.call(arguments, 1);

        PlotterModule.showAllTruckMarkers(locations);
        PlotterModule.updateSelectedPlaceInfo(0, WaffleLocatorModule.allPlacesArray);

        if (WaffleLocatorModule.dateString) {
            $('#locData').text("LOCATIONS FOR " + WaffleLocatorModule.dateString);
        }
        else {
            $('#locData').text("LOCATIONS FOR TODAY");
        }

        var content, idx;
        $('#cartSelect').empty();
        for (idx = 0; idx < locations.length; idx++) {
            content = '<option value="' + idx + '">' + locations[idx].get_name() + '</option>';
            $('#cartSelect').append(content);
            if (locations[idx].get_address()){
                PlotterModule.destinationIndices.push(idx);
            }
        }

        $('#locationsStatus').text("Locations Up-to-Date").removeClass("label-warning").addClass("label label-success");
    });
	
	$.subscribe("dataGetFailed", function(event, args) {
		//console.log(args);
		var locButton = $(document.getElementById('finder'));
        locButton.button('reset');

        $('#progBar').hide();
	    $('#locationsStatus').text("No Locations Found").removeClass("label-success").removeClass("label label-warning").addClass("label");
		
		$('#alertMessage').text("Failed to get Wafel Truck locations for " + args + "!");
		$('#alertGroup').show();
	});

    $.subscribe("gotDirections", function(event) {
        $('#progBar').hide();
        $('#showDirections').show();

        var toClosestButton = $(document.getElementById('direct'));
        toClosestButton.button('reset');

        var toSelectedButton = $(document.getElementById('newDirect'));
        toSelectedButton.button('reset');
    });

    $.subscribe("newDirectionsRequest", function(event) {
        // Publish this event when looking for new directions
        // This allows one central place to update (hide) the UI
        $('#showDirections').hide();
        $('#alertGroup').hide();

        $('#progBar').show();
    });

    $('#cartSelect').change(function () {
        //var selectVal = $(this).filter(":selected").val();
        var selectVal = $('#cartSelect :selected').val();
        PlotterModule.updateSelectedPlaceInfo(selectVal, WaffleLocatorModule.allPlacesArray);

        //console.log("Place name is: " + WaffleLocatorModule.allPlacesArray[selectVal].get_address())
        if (WaffleLocatorModule.allPlacesArray[selectVal].get_address()) {
            $('#alertGroup').hide();
        }
        else {
            $('#alertMessage').text("No address for the selected place!");
            $('#alertGroup').show();
        }
    });

    if (WaffleLocatorModule.loadWaffleInfo()) {
        console.log("Loaded from local storage (saved at: " + localStorage["WaffleLocatorModule.lastUpdate"] + ")");
        $.publish("dataParsed", WaffleLocatorModule.allPlacesArray);
    } else {
        // Could not load waffleInfo from local storage so making a call to W&D!
        console.log("Didn't load from local storage, making call to W&D");
        WaffleLocatorModule.getWDData();
    }

    // POST wdData version... in this case, do get results, but don't save
    $('#finder').click(function () {
        var dateString = $('#dateValue').val();
        var dateSplit = dateString.split("-");
        var day1 = dateSplit[1];
        var month1 = dateSplit[0];
        var year1 = dateSplit[2];
        var fullDate = month1 + "-" + day1 + "-" + year1;

        //console.log("The selected day is..." + fullDate);

        //var selectedTime = $('#timeSelect [name="time"]:checked').index();
        var selectedTime = $('#timeSelect .active').val();
        selectedTime = parseInt(selectedTime);
        if (selectedTime) {
            selectedTime = "<5"; // evening
        }
        else
        {
            selectedTime = "5";  // morning
        }
        //console.log("Selected radio button is" + selectedTime);

        $(this).button('loading');
        $('#progBar').show();

        WaffleLocatorModule.dateString = fullDate;
        WaffleLocatorModule.postWDData(fullDate, selectedTime);
        $('#locationsStatus').text("Locations Outdated").removeClass("label-success").addClass("label label-warning");
    });

    $('#newDirect').click(function () {
        var origin1 = $('#startLocation').val();
        if(!origin1) {
            $('#alertMessage').text("Please enter a start address!");
            $('#alertGroup').show();
            return this;
        }

        $.publish("newDirectionsRequest");
        $(this).button('loading');

        var selectVal = $('#cartSelect :selected').val();
        var destination = WaffleLocatorModule.allPlacesArray[selectVal].get_address();

        //console.log("Destination is " + destination);
        if (destination) {
            if (!$('#endLocation').val()) {
                $('#endLocation').val(destination);
            }
        }
        else {
            $('#alertMessage').text("No address for the selected place!");
            $('#alertGroup').show();
            return;
        }

        var travelModeSelected = $('#travelSelect').val();
        var travelModeText = $('#travelSelect').children(':selected').text();
        var travelModeDir;
        if (travelModeSelected === 'bicycling') {
            travelModeDir = google.maps.TravelMode.BICYCLING;
        } else if (travelModeSelected === 'walking') {
            travelModeDir = google.maps.TravelMode.WALKING;
        } else if (travelModeSelected === 'driving' ) {
            travelModeDir = google.maps.TravelMode.DRIVING;
        } else {
            travelModeDir = google.maps.TravelMode.TRANSIT;
        }
        PlotterModule.calcRoute(origin1, destination, travelModeDir);
        //$('#dirSelected').text(travelModeText + " directions to " + WaffleLocatorModule.allPlacesArray[selectVal].get_name());
        $('#myModalLabel').text(WaffleLocatorModule.allPlacesArray[selectVal].get_name() + ": " + travelModeText);
    });

    $('#direct').click(function () {
        var origin1 = $('#startLocation').val();
        if (!origin1) {
            origin1 = "535 E 72nd St, NY";
            $('#startLocation').val(origin1);
        }

        $.publish("newDirectionsRequest");
        $(this).button('loading');

        var destList = [];
        PlotterModule.destinationIndices = [];
        var idx, tempAddress;
        for (idx = 0; idx < WaffleLocatorModule.allPlacesArray.length; idx++) {
            tempAddress = WaffleLocatorModule.allPlacesArray[idx].get_address();
            if (tempAddress) {
                destList.push(WaffleLocatorModule.allPlacesArray[idx].get_address());
                PlotterModule.destinationIndices.push(idx);
            }
        }
        //console.log(destList);
        //console.log(PlotterModule.destinationIndices);

        var travelModeSelected = $('#travelSelect').val();
        var travelModeText = $('#travelSelect').children(':selected').text();
        var travelModeDir, travelModeCalc;
        //console.log("travel mode selected is " + travelModeSelected);

        if (travelModeSelected === 'bicycling') {
            travelModeCalc = google.maps.TravelMode.BICYCLING;
            travelModeDir = google.maps.TravelMode.BICYCLING;
        } else if (travelModeSelected === 'walking') {
            travelModeCalc = google.maps.TravelMode.WALKING;
            travelModeDir = google.maps.TravelMode.WALKING;
        } else {
            // default to DRIVING mode for calculations since TRANSIT is not supported
            travelModeCalc = google.maps.TravelMode.DRIVING;
            if (travelModeSelected === 'driving' ) {
                travelModeDir = google.maps.TravelMode.DRIVING;
            } else {
                travelModeDir = google.maps.TravelMode.TRANSIT;
            }
        }
        
        var service = new google.maps.DistanceMatrixService();
            service.getDistanceMatrix(
              {
                  origins: [origin1],
                  destinations: destList,
                  travelMode: travelModeCalc,
                  unitSystem: google.maps.UnitSystem.METRIC,
                  durationInTraffic: true,
                  avoidHighways: false,
                  avoidTolls: false
              }, function () {
                  //console.log(PlotterModule.destinationIndices);
                  // args 0 and 1 are response and status passed in by Google response, respectively
                  return callback(arguments[0], arguments[1], PlotterModule.destinationIndices, travelModeDir, travelModeText);
        });

        function callback(response, status, destinationIndices, travelModeDir) {
            if (status == google.maps.DistanceMatrixStatus.OK) {
                //console.log(response);

                var origins = response.originAddresses;
                var destinations = response.destinationAddresses;

                var leastDuration = {}, leastDistance = {};

                for (var i = 0; i < origins.length; i++) {
                    var results = response.rows[i].elements;
                    leastDuration.duration = results[0].duration;
                    leastDistance.distance = results[0].distance;
                    for (var j = 0; j < results.length; j++) {
                        var element = results[j];
                        var distance = element.distance.text;
                        var duration = element.duration.text;
                        var from = origins[i];
                        var to = destinations[j];

                        //console.log("Destination: " + to + " -- Duration: " + duration + " -- Distance: " + distance);

                        if (element.duration.value <= leastDuration.duration.value) {
                            leastDuration.duration = element.duration;
                            leastDuration.distance = element.distance;
                            leastDuration.destination = to;
                            leastDuration.placeIndex = destinationIndices[j];
                        }
                        if (element.distance.value <= leastDistance.distance.value) {
                            leastDistance.distance = element.distance;
                            leastDistance.duration = element.duration;
                            leastDistance.destination = to;
                            leastDistance.placeIndex = destinationIndices[j];
                        }
                    }
                }

                PlotterModule.updateSelectedPlaceInfo(leastDuration.placeIndex, WaffleLocatorModule.allPlacesArray);
                PlotterModule.calcRoute(origins[0], leastDuration.destination, travelModeDir);

                var closestButton = $(document.getElementById('direct'));
                closestButton.button('reset');

                //$('#dirSelected').text(travelModeText + " directions to " + WaffleLocatorModule.allPlacesArray[leastDuration.placeIndex].get_name());
                $('#myModalLabel').text(WaffleLocatorModule.allPlacesArray[leastDuration.placeIndex].get_name() + ": " + travelModeText);
                //WaffleLocatorModule.saveRoute(); // TODO: use local storage to save the origin and destination route
            }
        }


    });

});
