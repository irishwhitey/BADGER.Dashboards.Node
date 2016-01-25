(function() {
    'use strict';

    TLRGRP.namespace('TLRGRP.BADGER.Dashboard.Components');

    var idIncrementor = 0;

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
            "aggs": {
                "errors": {
                    "filter": {
                        "term": {
                            "service": "connectivity"
                        }
                    },
                    "aggs": {
                        "bytime": {
                            "date_histogram": {
                                "min_doc_count": 0,
                                "extended_bounds": {
                                    "min": "now-1h",
                                    "max": "now"
                                },
                                "field": "@timestamp",
                                "interval": "1m"
                            },
                            "aggs": {
                                "types": {
                                    "terms": {
                                        "field": "metric"
                                    },
                                    "aggs": {
                                        "total": {
                                            "sum": {
                                                "field": "value"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                "bookings": {
                    "filter": {
                        "term": {
                            "service": "bookingsByProvider"
                        }
                    },
                    "aggs": {
                        "bytime": {
                            "date_histogram": {
                                "min_doc_count": 0,
                                "extended_bounds": {
                                    "min": "now-48h",
                                    "max": "now"
                                },
                                "field": "@timestamp",
                                "interval": "1m"
                            },
                            "aggs": {
                                "types": {
                                    "terms": {
                                        "field": "metric"
                                    },
                                    "aggs": {
                                        "total": {
                                            "sum": {
                                                "field": "value"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "size": 0
        };
    }

    function getParameterByName(name) {
        name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
        var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
            results = regex.exec(location.search);
        return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
    }

    var checkStates = {
        '0': {
            name: 'OK',
            iconClass: 'fa fa-check',
            priority: 3,
            summaryClass: 'ok'
        },
        '1': {
            name: 'Warn',
            iconClass: 'fa fa-exclamation',
            priority: 1,
            summaryClass: 'warning'
        },
        '2': {
            name: 'Critical',
            iconClass: 'mega-octicon octicon-flame',
            priority: 0,
            summaryClass: 'critical'
        },
        '3': {
            name: 'Unknown',
            iconClass: 'fa fa-question',
            priority: 2,
            summaryClass: 'unknown'
        }
    };

    var checks = {
        'Provider Errors': {
            order: 1,
            metric: 'providerErrors'
        },
        'Provider Bookings': {
            order: 0,
            metric: 'bookings'
        },
        'Provider Booking Errors': {
            order: 2,
            metric: 'bookingErrors'
        }
    };

    function parseOutput(output) {
        if (!/Current value: (-?[0-9]+(\.[0-9]+)?), warn threshold: (-?[0-9]+(\.[0-9]+)?), crit threshold: (-?[0-9]+(\.[0-9]+)?)/.exec(output)) {
            return;
        }

        var value = /Current value: (-?[0-9]+(\.[0-9]+)?)/.exec(output)[1];
        var warn = /warn threshold: (-?[0-9]+(\.[0-9]+)?)/.exec(output)[1];
        var crit = /crit threshold: (-?[0-9]+(\.[0-9]+)?)/.exec(output)[1];

        return {
            value: value,
            warn: warn,
            crit: crit
        };
    }

    TLRGRP.BADGER.Dashboard.Components.ProviderDetailSummary = function(configuration) {
        var providerName = getParameterByName('provider');

        if (!configuration.title) {
            configuration.title = providerName + ' Summary';
        }

        var refreshServerBaseUrl = 'http://' + configuration.host + ':' + configuration.port + '/';
        var inlineLoading = new TLRGRP.BADGER.Dashboard.ComponentModules.InlineLoading({
            cssClass: 'loading-clear-bottom'
        });
        var lastUpdated = new TLRGRP.BADGER.Dashboard.ComponentModules.LastUpdated({
            cssClass: 'last-updated-top-right'
        });

        var summary = $('<ul class="connectivity-service-summary"></ul>');
        var overallSummary = $('<div class="connectivity-service-status-indicator pending">' + '<span class="fa fa-question connectivity-service-summary-status-indicator pending"></span>' + '<span class="fa fa-question connectivity-service-summary-status-indicator unknown"></span>' + '<span class="fa fa-check connectivity-service-summary-status-indicator ok"></span>' + '<span class="fa fa-exclamation connectivity-service-summary-status-indicator warning"></span>' + '<span class="mega-octicon octicon-flame connectivity-service-summary-status-indicator critical"></span>' + '</div>').appendTo($('<li />').appendTo(summary));
        var overallDescription = $('<li class="connectivity-provider-description"><h2>Connecting...</h2>Contacting Icinga2...</li>').appendTo(summary);
        var checkSummary = $('<li />').appendTo(summary);
        var selectedCheck = getParameterByName('showCheck') || 'Provider Errors';

        checkSummary.on('click', '.provider-summary-item', function(e) {
            var clickedCheck = $(e.target).closest('.provider-summary-item');
            var selectedCheck = clickedCheck.data('checkName');

            TLRGRP.messageBus.publish('TLRGRP.BADGER.ProviderSummary.CheckSelected', {
                check: selectedCheck,
                metric: checks[selectedCheck].metric
            });
        });

        function checkSelected(data) {
            selectedCheck = data.check;

            $('#provider-summary-check-item-' + data.check.replace(/ /g, ''))
                .addClass('selected')
                .siblings()
                .removeClass('selected');
        }

        TLRGRP.messageBus.subscribe('TLRGRP.BADGER.ProviderSummary.CheckSelected', checkSelected);

        var modules = [lastUpdated, inlineLoading, {
            appendTo: function(container) {
                container.append(summary);
            }
        }];

        var componentLayout = new TLRGRP.BADGER.Dashboard.ComponentModules.ComponentLayout({
            title: configuration.title,
            layout: configuration.layout,
            componentClass: 'provider-summary',
            modules: modules
        });

        var callbacks = {
            success: function(data) {
                var viewModels = TLRGRP.BADGER.Dashboard.Components.ProviderSummaryViewModels;

                viewModels.groupData(data)
                    .then(function(groupedChecks) {
                        var provider = groupedChecks[0].providers[0];

                        overallSummary[0].className = 'connectivity-service-status-indicator ' + checkStates[provider.worstCheckState].summaryClass;

                        overallDescription.html(Mustache.render('<h2>{{title}}</h2>{{{text}}}', {
                            title: provider.displayName
                        }));

                        if (!selectedCheck) {
                            selectedCheck = _.chain(provider.services)
                                .sortBy(function(service) {
                                    return checkStates[service.attrs.last_check_result.state].priority + ':' + checks[service.attrs.name];
                                })
                                .first()
                                .value().attrs.name;
                        }

                        var viewModel = {
                            services: _.chain(provider.services).sortBy(function(service) {
                                return checks[service.attrs.name].order;
                            }).map(function(service) {
                                var checkIcons = {
                                    'Provider Bookings': {
                                        icon: '£',
                                        cssClass: 'bookings'
                                    },
                                    'Provider Booking Errors': {
                                        icon: '<span class="mega-octicon octicon-flame"></span>',
                                        cssClass: 'booking-errors'
                                    },
                                    'Provider Errors': {
                                        icon: '<span class="fa fa-exclamation"></span>',
                                        cssClass: 'errors'
                                    },
                                };

                                var displayName = service.attrs.display_name.substring(9);
                                var id = 'provider-summary-check-item-' + service.attrs.name.replace(/ /g, '');
                                var subText;

                                if (service.attrs.name === 'Provider Bookings') {
                                    subText = 'in last ' + service.attrs.vars.bookings_in_last_hours + 'hrs';
                                } else if (service.attrs.vars.graphite_url) {
                                    var graphiteTimeSegment = /from=-(([0-9]+)(h|m|s))/ig;

                                    var graphiteTimeMatches = graphiteTimeSegment.exec(service.attrs.vars.graphite_url);

                                    var time = parseInt(graphiteTimeMatches[2], 10);
                                    var timeUnits = graphiteTimeMatches[3];

                                    var units = {
                                        'h': {
                                            singular: 'hour',
                                            plural: 'hrs'
                                        },
                                        'm': {
                                            singular: 'minute',
                                            plural: 'mins'
                                        },
                                        's': {
                                            singular: 'second',
                                            plural: 'secs'
                                        }
                                    };

                                    subText = 'in last ';

                                    if (time === 1) {
                                        subText += units[timeUnits].singular;
                                    } else {
                                        subText += time + units[timeUnits].plural;
                                    }
                                }

                                return {
                                    id: id,
                                    name: service.attrs.display_name,
                                    displayName: displayName,
                                    subText: subText,
                                    value: parseInt(parseOutput(service.attrs.last_check_result.output).value, 10),
                                    checkIcon: checkIcons[service.attrs.name].icon,
                                    emblemClass: checkIcons[service.attrs.name].cssClass,
                                    itemClass: checkStates[service.attrs.last_check_result.state].summaryClass + (selectedCheck === service.attrs.name ? ' selected' : '')
                                };
                            }).value()
                        };

                        checkSummary.html(Mustache.render('<ul class="connectivity-service-summary-tier-list">' + '{{#services}}' + '<li id="{{id}}" class="provider-summary-item {{itemClass}}" data-check-name="{{name}}"><div class="connectivity-service-summary-tier-emblem {{emblemClass}}">{{{checkIcon}}}</div><div class="provider-summary-check-item-value">{{value}}</div><div class="provider-summary-check-item-title">{{displayName}}</div><div class="provider-summary-check-item-subtext">{{subText}}</div><div class="provider-summary-selected-indicator"><i class="mega-octicon octicon-triangle-down"></i></div></li>' + '{{/services}}' + '</ul>', viewModel));

                        overallDescription.width(summary.innerWidth() - (13 + overallSummary.outerWidth() + checkSummary.outerWidth()));
                    });
            },
            error: function(errorInfo) {}
        };

        configuration.query = buildQuery(providerName);
        configuration.mappings = [{
            "type": "extractFromDateHistogram",
            "defaultValue": 0,
            "aggregates": {
                "errors.bytime": {
                    "bookingErrors": "types.buckets.:find(key=providerBookingErrors).total.value",
                    "errors": "types.buckets.:find(key=providerErrors).total.value"
                },
                "bookings.bytime": {
                    "bookings": "types.buckets.:find(key=count).total.value",
                }
            }
        }];

        var metricDataStore = new TLRGRP.BADGER.Dashboard.DataStores.SyncAjaxDataStore({
            request: new TLRGRP.BADGER.Dashboard.DataSource.elasticsearch(configuration),
            refresh: 5000,
            mappings: configuration.mappings,
            callbacks: {
                success: function(data) {
                    console.log(JSON.stringify(data));

                    TLRGRP.messageBus.publish('TLRGRP.BADGER.ProviderDetailSummary.MetricData', {
                        data: data,
                        check: selectedCheck,
                        metric: checks[selectedCheck].metric
                    });
                }
            },
            components: {
                loading: inlineLoading
            }
        });

        var dataStore = {
            start: function() {
                TLRGRP.messageBus.publish('TLRGRP.BADGER.SharedDataStore.Subscribe.' + configuration.storeId, {
                    id: 'ProviderSummary-' + (idIncrementor++),
                    refreshComplete: callbacks.success,
                    loading: inlineLoading,
                    lastUpdated: lastUpdated
                });
            },
            stop: function() {
                TLRGRP.messageBus.publish('TLRGRP.BADGER.SharedDataStore.Unsubscribe.' + configuration.storeId);
            }
        };

        var stateMachine = nano.Machine({
            states: {
                uninitialised: {
                    initialise: function(container) {
                        componentLayout.appendTo(container);

                        return this.transitionToState('initialising');
                    }
                },
                initialising: {
                    _onEnter: function() {
                        dataStore.start(true);
                        metricDataStore.start(true);
                    }
                }
            },
            initialState: 'uninitialised'
        });

        return {
            render: function(container) {
                inlineLoading.loading();
                return stateMachine.handle('initialise', container);
            },
            unload: function() {
                stateMachine.handle('stop');
                stateMachine.handle('remove');

                TLRGRP.messageBus.publish('TLRGRP.BADGER.SharedDataStore.Unsubscribe.' + configuration.storeId);
                TLRGRP.messageBus.unsubscribeAll('TLRGRP.BADGER.ProviderSummary.CheckSelected');

                dataStore.stop();
                metricDataStore.stop();
            }
        };
    }
})();