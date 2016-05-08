'use strict';

const Readable = require('stream').Readable;
const isReadableStream = require('./utils').isReadableStream;

class RecursiveIterable {
    constructor(obj, replacer) {
        // Save a copy of the root object so we can be memory effective
        if (obj && typeof obj.toJSON === 'function') {
            obj = obj.toJSON();
        }
        this.exclude = [Promise, {
            __shouldExclude: isReadableStream
        }];
        this.obj = this._shouldIterate(obj) ? Array.isArray(obj) ? obj.slice(0) : Object.assign({}, obj) : obj;
        this.replacer = replacer instanceof Function ? replacer : undefined;
    }

    _shouldIterate(val) {
        return val && typeof val === 'object' && !(this.exclude.some(v => v.__shouldExclude instanceof Function ? v.__shouldExclude(val) : val instanceof v));
    }

    static _getType(obj) {
        return Array.isArray(obj) ? Array : obj instanceof Object ? Object : undefined
    }

    [Symbol.iterator]() {
        let isObject = this._shouldIterate(this.obj);
        let ctxType = RecursiveIterable._getType(this.obj);
        let nextIndex = 0;
        let keys = isObject && Object.keys(this.obj);
        let childIterator;
        let closed = !isObject;
        let opened = closed;

        const attachIterator = iterator => childIterator = iterator;
        const ctx = {
            depth: 0,
            type: this._forcedCtxType || ctxType,
            next: () => {
                let child = childIterator && childIterator.next();
                if (child) {
                    if (!child.done) {
                        return child;
                    }
                    childIterator = undefined;
                }

                let state;
                let key;
                let val;
                let type;

                if (!opened) {
                    state = 'open';
                    type = ctxType;
                    opened = true;
                } else if (!closed && !keys.length) {
                    state = 'close';
                    type = ctxType;
                    closed = true;
                } else if (keys && keys.length) {
                    state = 'value';
                    key = keys.shift();
                    val = this.obj[key];
                } else if (!isObject && !ctx.done) {
                    state = 'value';
                    val = this.obj;
                    ctx.done = true;
                }

                if(state === 'value') {
                    if (this.replacer) {
                        val = this.replacer(key, val);
                    }

                    if (val && typeof val.toJSON === 'function') {
                        val = val.toJSON();
                    }

                    if (val === undefined) {
                        if (key) {
                            // Dereference iterated object
                            this.obj[key] = undefined;
                        }

                        if (ctx.type !== Array) {
                            return ctx.next();
                        }

                        val = null;
                    }

                    if (this._shouldIterate(val)) {
                        state = 'child';
                        childIterator = new RecursiveIterable(val)[Symbol.iterator]();
                        childIterator.ctxType = ctx.type;
                        childIterator.depth = ctx.depth + 1;
                        childIterator.type = RecursiveIterable._getType(val);
                    }

                    if (key) {
                        // Dereference iterated object
                        this.obj[key] = undefined;
                    }
                }

                return {
                    value: {
                        depth: ctx.depth,
                        key: key,
                        value: val,
                        state: state,
                        type: type,
                        ctxType: ctx.type,
                        attachChild: attachIterator
                    },
                    done: !state
                };
            }
        };

        return ctx;
    }
}

module.exports = RecursiveIterable;
