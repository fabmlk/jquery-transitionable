/**
 * Custom jquery plugin for easily navigate slideshow-like elements.
 * Could not find simple implementation for what I wanted so here it is...
 * TODO: instead of using jquery animations, use CSS animations as more performant (GPU internal stuff)
 * 
 * Given an element, this plugin converts all its direct children as being transitionable like a slideshow.
 * I wanted simple "next/prev" methods to be called to transition from the current element to the next/previous sibliing.
 * It does not support continous transitions in time: the transition must be called manually.
 * Effects supported:
 *  - fading : one element transition to the prev/next with the same fading effect
 *  - sliding: like a page navigation, one element transition to the next by sliding from right to left,
 *          or to the previous by sliding from left to right.
 *          
 *  Next & prev methods can be passed a callback to execute when the transition is complete.
 *  
 *  Options:
 *      - loop: boolean true|false. If next is called when there are not next sibling in the DOM, the default is looping back to the previous element (default: true)
 *      - effect: string "fade"|"slide" or null. If no effect is specified when doing the transition, defaults to the one specified.
 *          By default, null is applied indicating we don't apply any effects.
 *      - fadeDuration: integer. Number of miliseconds for the fading effect. Defaults to jquery default (400ms).
 *      - slideDuration: integer. Numbert of miliseconds for the sliding effect. Defaults to jquery default (400ms).
 *      
 * Event:
 *      - fab-transitionablebeforeloop: when a call to next or prev leads to a loop to the opposite element, this event is fired.
 *                                      The user can cancel the loop effect by returning false.
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
        fadeDuration: $.fx.speeds._default, // default fading duration
        slideDuration: $.fx.speeds._default // default sliding duration
    },
        pluginName = 'fab-transitionable',
        dataKey = 'plugin-' + pluginName // data key keeping the instance of the plugin to the wrapper element
    ;

    // The actual plugin constructor
    var Transitionable = function ( element, options ) {
        this.element = element;

        this.options = $.extend( {}, defaults, options) ;

        this.init();
    };

    Transitionable.prototype = {

        /**
         * Performs plugin initialization by keeping the width of the wrapper element (and adjusting it on resize)
         * and hide all other children but the first child.
         * @returns {undefined}
         */
        init: function() {
            var wrapper = this.element,
                children = wrapper.children(),
                self = this;
        
            wrapper.addClass("wrapper-" + pluginName);
            this.index = 0;
            this.width = wrapper.width();
            children.not(":eq(0)").hide();
            wrapper.on("resize", function () {
                self.width = wrapper.width();
            });
        },
        
        /**
         * Performs the actual transition using jquery animation.
         * 
         * @param {string} direction "prev"|"next"
         * @param {string} effect "slide"|"fade"
         * @param {function} complete (optional) - the callback to call when the transition is finished
         * @returns {undefined}
         */
        _navigate: function (direction, effect, complete) {
            var wrapper = this.element,
                children = wrapper.children(),
                elt = children.eq(this.index),
                siblings = children.not(elt),
                beforeLoopEvent = $.Event(pluginName + "beforeloop")
                ;
            
            // does not support animation queuing
            if (elt.is(":animated")) {
                return;
            }
            
            complete = complete || $.noop;
            effect = effect || this.options.effect;
        
            beforeLoopEvent.target = this.element; // to support delegated events
            
            // if we're about to loop, trigger beforeloop event and continue is not prevented or options.loop is false
            if (direction === "next" && this.index === children.length - 1 || direction === "prev" && this.index === 0) {
                wrapper.trigger(beforeLoopEvent);
                if (this.options.loop === false || beforeLoopEvent.isDefaultPrevented()) {
                    return;
                }
            }
            
            // calculate the index of the element we are transitioning to
            if (direction === "next") {
                this.index = (this.index + 1) % children.length;
            } else {
                this.index = (this.index === 0 ? children.length - 1 : this.index - 1);
            }
            
            var target = children.eq(this.index); // the actual element we are transitioning to
            
            // For any transition, once the effect is done we must have only 1 element visible (the others are hidden)
            switch (effect) {
                // algo: stack all elements (in case coordinates changed after sliding effect)
                // and fade-in the target element while fading out the current one (Note: fadeIn show a hidden element and fadeOut hide a visible element)
                case "fade":
                    children.css("left", 0);
                    target.fadeIn(this.options.fadeDuration);
                    elt.fadeOut(this.options.fadeDuration, complete);
                    break;
                    
                // algo: stack all siblings of the current element to the left or right of the current element (depending of direction)
                // and slide the current element left or right while sliding the target element simmetrically left or right.
                // The current element is hidden once finished and the target element must be shown before sliding.
                case "slide":
                    siblings.css("left", this.width * (direction === "next" ? 1 : -1));
                    elt.animate({left: this.width * (direction === "next" ? -1 : 1)}, {
                        done: function () {
                            $(this).hide();
                        },
                        duration: this.options.slideDuration
                    });
                    target.show().animate({left: 0}, {
                        done: complete,
                        duration: this.options.slideDuration
                    });
                    break;
                
                default:
                    children.css("left", 0);
                    target.show();
                    elt.hide();
                    break;
            }
        },

        /**
         * Convenient method for direct invocation to go next
         * @param {string} effect "slide"|"fade"
         * @param {function} complete (optional)
         * @returns {undefined}
         */
        next: function(effect, complete) {
            return this._navigate("next", effect, complete);
        },
        
        /**
         * Convenient method for direct invocation to go previous
         * @param {string} effect "slide"|"fade"
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
            var wrapper = this.element;
            wrapper.off("resize").removeClass("wrapper-" + pluginName);
            wrapper.removeData(dataKey);
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
            plugin.init(options);
        }
        return plugin;
    };
}));
