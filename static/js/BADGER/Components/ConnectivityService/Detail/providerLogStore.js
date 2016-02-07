(function() {
    'use strict';

    TLRGRP.namespace('TLRGRP.BADGER.Dashboard.ComponentModules.ProviderSummary.Metrics');

    var timeCharToUnits = {
        's': 'seconds',
        'm': 'minutes',
        'h': 'hours',
        'd': 'days'
    };

    function getTimeFrameFromCheck(service) {
        if (service.attrs.name === 'Provider Bookings') {
            return { timeFrame: service.attrs.vars.bookings_in_last_hours, units: 'hours' };
        } else if (service.attrs.vars.graphite_url) {
            var graphiteTimeSegment = /from=-(([0-9]+)(h|m|s))/ig;

            var graphiteTimeMatches = graphiteTimeSegment.exec(service.attrs.vars.graphite_url);

            var time = parseInt(graphiteTimeMatches[2], 10);
            var timeUnits = graphiteTimeMatches[3];

            return { timeFrame: time, units: timeCharToUnits[timeUnits] }
        }
    }

    function buildQuery(providerName) {
        return {
            "query": {
                "filtered": {
                    "filter": {
                        "bool": {
                            "must": [{
                                "or": [{
                                    "and": [{
                                        "range": {
                                            "@timestamp": {
                                                "from": "now-1h"
                                            }
                                        }
                                    }, {
                                        "terms": {
                                            "metric": [
                                                "providerErrors",
                                                "providerBookingErrors"
                                            ]
                                        }
                                    }]
                                }, {
                                    "and": [{
                                        "range": {
                                            "@timestamp": {
                                                "from": "now-48h"
                                            }
                                        }
                                    }, {
                                        "term": {
                                            "service": "bookingsByProvider"
                                        }
                                    }]
                                }]
                            }, {
                                "term": {
                                    "provider": providerName
                                }
                            }]
                        }
                    }
                }
            },
            "size": 0
        };
    }

    TLRGRP.BADGER.Dashboard.ComponentModules.ProviderSummary.Logs = {
        logStore: function createMetricStore(providerName, inlineLoading, callbacks, configuration, alertData, checkTimeFrames) {
            configuration.defaultTimeFrame = _.last(checkTimeFrames).timeFrame || { timeFrame: "1", units: 'hours' };
            configuration.query = buildQuery(providerName);
            configuration.mappings = [];

            return new TLRGRP.BADGER.Dashboard.DataStores.SyncAjaxDataStore({
                request: new TLRGRP.BADGER.Dashboard.DataSource.elasticsearch(configuration),
                refresh: 5000,
                mappings: configuration.mappings,
                callbacks: callbacks,
                components: {
                    loading: inlineLoading
                }
            });
        }
    };
})();