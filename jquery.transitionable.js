/**
 * Custom jquery plugin for easily navigate slideshow-like elements with either fading or translating effect.
 * There are some implementations out there but are either too heavily-featured or do not provide both fading and translating.
 * It uses CSS transitions internally.
 * 
 * Given an element, this plugin converts all its direct children as being transitionable like a slideshow.
 * I wanted simple "next/prev" methods to be called to transition from the current element to the next/previous sibliing.
 * It does not support continous transitions in time: the transition must be called manually.
 * Effects supported:
 *  - fading : one element transition to the prev/next with the same fading effect
 *  - sliding: like a page navigation, one element transition to the next by sliding from right to left,
 *          or to the previous by sliding from left to right or similarly with up/down.
 *          
 *  Next & prev methods can be passed a callback to execute when the transition is complete.
 *  
 *  Options:
 *      - loop: boolean true|false. If next is called when there are not next sibling in the DOM, the default is looping back to the previous element (default: true)
 *      - effect: string "fade"|"slide" or null. If no effect is specified when doing the transition, defaults to the one specified.
 *          By default, null is applied indicating we don't apply any effects (default: null).
 *      - direction: string "horizontal"|"vertical" meaning respectively transition from right/left or up/down (only applies if effect is "slide") (default: horizontal).
 *      
 * Event:
 *      - fab-transitionablebeforeloop: when a call to next or prev leads to a loop to the opposite element, this event is fired.
 *                                      The user can cancel the loop effect by returning false.
 *                                      
 * By default, timing animation is set to 0.25s in the accompanying stylesheet.
 * To override the default, simply add a CSS rule that override transition-duration property of the rules .page-fab-transitionable.slide-transition 
 * or .page-fab-transitionable.fade-transition.
 * 
 * Usage examples:
 * This plugin support 2 invokation modes: via "named-method" call:
 * $(".pagewrapper").transitionable();
 * $(".pagewrapper").transitionable("next", "fade"); // show next element by applying fading effect
 * $(".pagewrapper").transitionable("next", "slide", function () { console.log("done")}); // show next element by applying slide effect and pass callback on complete
 * $(".pagewrapper").transitionable("prev", "slide"); // show previous element by applying slide effect
 * 
 * Or alternatively you can use direct calls by keeping a reference to the plugin object:
 * var transitionable = $(".pagewrapper").transitionable();
 * transitionable.next("slide");
 * transitionable.prev("fade", myCallbackOnComplete);
 * 
 * WARNING: this plugin is not chainable and does not support runtime options changes. Animation queuing is also prevented: if next or prev is called
 * while an animation is running, is is simply ignored.
 * 
 * The plugin can be destroyed by calling the destroy method.
 * 
 * Inspiration: https://github.com/ccoenraets/PageSlider
 *
 * TODO: implement setOption() method to easily switch direction. Right now, no option can be overriden once plugin attached.
 *
 * @author Lanoux Fabien
 */

(function( factory ) {
	if ( typeof define === "function" && define.amd ) {
		// AMD. Register as an anonymous module.
		define([
			"jquery"
		], factory );
	} else if(typeof module === 'object' && module.exports) {
		// Node/CommonJS
		module.exports = factory(require("jquery"));
	} else {
		// Browser globals
		factory( jQuery );
	}
}(function( $ ) {

    // Create the defaults once
    var defaults = {
        loop: true, // allow looping when end is bound limit is reached
        effect: null, // default effect
        direction: "horizontal" // default direction along X-axis
    },
        pluginName = 'fab-transitionable',
        dataKey = 'plugin-' + pluginName // data key keeping the instance of the plugin to the wrapper element
    ;

    // The actual plugin constructor
    var Transitionable = function ( element, options ) {
        this.element = element;

        this.options = $.extend( {}, defaults, options) ;
        if (["horizontal", "vertical"].indexOf(this.options.direction) === -1) {
            throw new Error("Invalid option direction: " + this.options.direction + ". Must be 'horizontal' or 'vertical'.");
        }
        if (["slide", "fade", null].indexOf(this.options.effect) === -1) {
            throw new Error("Invalid option effect: " + this.options.effect + ". Must be 'slide' or 'fade' or null.");
        }

        this.init();
    };

    Transitionable.prototype = {
        /**
         * Helper function to return relevant transition class from the navigation and direction
         * @param navigation
         * @param direction
         * @param opposite (default: false) if we have to invert the results along current direction axis
         * @returns {string} the class name
         * @private
         */
        _returnClassFromNavigationAndDirection: function (navigation, direction, opposite) {
            opposite = opposite || false;
            if (direction === "horizontal" && navigation === "next") {
                return opposite ? "left-" + pluginName : "right-" + pluginName;
            }
            if (direction === "horizontal" && navigation === "prev") {
                return opposite ? "right-" + pluginName : "left-" + pluginName;
            }
            if (direction === "vertical" && navigation === "next") {
                return opposite ? "up-" + pluginName : "down-" + pluginName;
            }
            return opposite ? "down-" + pluginName : "up-" + pluginName;
        },

        /**
         * Helper function to return all current custom classes of an element
         * (ignoring this plugin-specific classes)
         * @param elt the element to extract classes from
         * @returns {string} custom classes of elt separated by space (ready to reinsert as is)
         * @private
         */
        _getOwnEltClasses: function (elt) {
            return elt.attr("class").split(" ").filter(function (cssclass) {
                return cssclass.indexOf(pluginName) === -1;
            }).join(" ");
        },

        /**
         * Performs plugin initialization by keeping the width of the wrapper element (and adjusting it on resize)
         * and hide all other children but the first child.
         */
        init: function() {
            var wrapper = this.element,
                children = wrapper.children();
        
            wrapper.addClass("wrapper-" + pluginName);
            this.index = 0;
            this.earlyReturn = false; // we will need this to detect if we're ready to perform the transition in case the javascript and css go out of sync

            children.addClass("page-" + pluginName).not(":eq(0)").hide();
        },
        
        /**
         * Performs the actual transition using css transitions.
         * 
         * @param {string} navigation "prev"|"next"
         * @param {string} effect (optional) "slide"|"fade" (default instance option or else global default option)
         * @param {function} complete (optional) - the callback to call when the transition is finished (default instance option or else global default option)
         */
        _navigate: function (navigation, effect, complete) {
            // if has not finished transitioning, stop right there
            if (this.earlyReturn === true) {
                return;
            }
            this.earlyReturn = true;


            var wrapper = this.element,
                children = wrapper.children(),
                elt = children.eq(this.index),
                beforeLoopEvent = $.Event(pluginName + "beforeloop"),
                that = this
                ;
            // some argument checks
            if (["next", "prev"].indexOf(navigation) === -1) { // we passed direction in place of navigation, shift arguments
                navigation = "next"; // arbitrary default
            }
            if (["slide", "fade"].indexOf(effect) === -1) {
                effect = this.options.effect;
            }
            complete = (typeof complete === "function" ? complete : $.noop);
        
            beforeLoopEvent.target = this.element; // to support delegated events
            
            // if we're about to loop, trigger beforeloop event and continue if not prevented or options.loop is false
            if (navigation === "next" && this.index === children.length - 1 || navigation === "prev" && this.index === 0) {
                wrapper.trigger(beforeLoopEvent);
                if (this.options.loop === false || beforeLoopEvent.isDefaultPrevented()) {
                    return;
                }
            }
            
            // calculate the index of the element we are transitioning to
            if (navigation === "next") {
                this.index = (this.index + 1) % children.length;
            } else {
                this.index = (this.index === 0 ? children.length - 1 : this.index - 1);
            }
            
            var target = children.eq(this.index); // the actual element we are transitioning to
            var ownTargetClasses = this._getOwnEltClasses(target);
            var ownEltClasses = this._getOwnEltClasses(elt);
            
            // For any transition, once the effect is done we must have only 1 element visible (the others are hidden)
            switch (effect) {
                // opacity transition
                case "fade":
                    // set target to being visible but with 0 opacity
                    target.attr("class", ownTargetClasses + " page-" + pluginName + " hide-" + pluginName).show();
                    // set current element to 1 opacity
                    elt.attr("class", ownEltClasses + " page-" + pluginName + " show-" + pluginName);
                    
                    target.one('transitionend', function () {
                        elt.hide();
                        complete();
                        that.earlyReturn = false;
                    });
                    
                    // Force reflow. More information here: http://www.phpied.com/rendering-repaint-reflowrelayout-restyle/
                    wrapper[0].offsetWidth;
                    
                    // execute opposite opacity transition on target and current
                    target.attr("class", ownTargetClasses + " page-" + pluginName + " fade-transition-" + pluginName + " show-" + pluginName);
                    elt.attr("class", ownEltClasses + " page-" + pluginName + " fade-transition-" + pluginName + " hide-" + pluginName);
                    break;
                    
                // translateX transition
                case "slide":
                    // set target to its starting position offset and visible
                    target.attr("class", ownTargetClasses + " page-" + pluginName + " "
                        + this._returnClassFromNavigationAndDirection(navigation, this.options.direction))
                        .show();
                    
                    target.one('transitionend', function (event) {
                        elt.hide();
                        complete();
                        that.earlyReturn = false;
                    });
                    
                    // Force reflow. More information here: http://www.phpied.com/rendering-repaint-reflowrelayout-restyle/
                    wrapper[0].offsetWidth;
                    
                    // execute opposite translation along X-axis on target and current
                    target.attr("class", ownTargetClasses + " page-" + pluginName +  " slide-transition-" + pluginName + " center-" + pluginName);
                    elt.attr("class", ownEltClasses + " page-" + pluginName + " slide-transition-" + pluginName + " "
                        + this._returnClassFromNavigationAndDirection(navigation, this.options.direction, true)); // opposite = true
                    break;
                
                // no transition: immediate hide/show
                default:
                    target.attr("class", ownTargetClasses + " page-" + pluginName).show();
                    elt.attr("class", ownEltClasses + " page-" + pluginName).hide();
                    complete();
                    that.earlyReturn = false;
                    break;
            }
        },

        /**
         * Convenient method for direct invocation to go next
         * @param {string} effect "slide"|"fade" (optional)
         * @param {function} complete (optional)
         * @returns {undefined}
         */
        next: function(effect, complete) {
            return this._navigate("next", effect, complete);
        },
        
        /**
         * Convenient method for direct invocation to go previous
         * @param {string} effect "slide"|"fade" (optional)
         * @param {function} complete (optional)
         * @returns {undefined}
         */
        prev: function (effect, complete) {
            return this._navigate("prev", effect, complete);
        },
        
        /**
         * Destroy the plugin so it can clean after itself
         */
        destroy: function () {
            this.element.removeData(dataKey)
                .removeClass("wrapper-" + pluginName)
                .children().show()
                    .removeClass(["page-" + pluginName, "hide-" + pluginName,
                        "show-" + pluginName, "center-" + pluginName,
                        "left-" + pluginName, "right-" + pluginName,
                        "up-" + pluginName, "down-" + pluginName,
                        "slide-transition-" + pluginName, "fade-transition-" + pluginName
                    ].join(" "));
        }
    };

    // A really lightweight plugin wrapper around the constructor,
    // preventing against multiple instantiations
    $.fn.transitionable = function ( options ) {
        var plugin = this.data(dataKey);
        
        if (plugin instanceof Transitionable) {
            if (typeof options === 'string') {
                if (!plugin[options]) {
                    throw 'Unkown method: ' + options;
                }
                plugin[options].apply(plugin, Array.prototype.slice.call(arguments, 1));
            }
        } else {
            plugin = new Transitionable(this, options);
            this.data(dataKey, plugin);
        }
        return plugin;
    };
}));
