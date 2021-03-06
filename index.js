import {mat4, vec2} from 'gl-matrix';

const DEFAULT_CONFIG = Object.freeze({
    homeTilt: 0.25,    // starting tilt in radians
    startSpin: 0.02,   // initial spin in radians per second
    autoTick: true,    // if false, clients must call the tick method once per frame
    friction: 0.125,   // 0 means no friction (infinite spin) while 1 means no inertia
});

const STATES = Object.freeze({
    Resting: 0,
    Coasting: 1,
    DraggingInit: 2,
    DraggingSpin: 3,
    DraggingTilt: 4,
});

const INTERNAL_CONFIG = Object.freeze({
    allowTilt: true,
    allowSpin: true,
    epsilon: 3,
    radiansPerPixel: [0.01, 0.01],
    clampTilt: Math.PI / 2
});

export default class Trackball {
    // Optionally takes a DOM element for listening to pointer events.
    // If no element is provided, clients must call the handleEvent or *Drag methods manually.
    constructor(el, options) {
        this.config = {};
        Object.assign(this.config, INTERNAL_CONFIG);
        Object.assign(this.config, DEFAULT_CONFIG);
        Object.assign(this.config, options);
        this.config = Object.freeze(this.config);
        if (this.config.autoTick) {
            this.tick = this.tick.bind(this);
            window.requestAnimationFrame(this.tick);
        }
        if (el) {
            const handler = this.handleEvent.bind(this);
            el.addEventListener('wheel', handler);
            el.addEventListener('pointermove', handler);
            el.addEventListener('pointerdown', handler);
            el.addEventListener('pointerup', handler);
        }
        this.startPosition = [0, 0];
        this.currentPosition = [0, 0];
        this.previousPosition = this.currentPosition.slice();
        this.previous2Position = this.currentPosition.slice();
        this.currentSpin = 0;
        this.currentTilt = this.config.homeTilt;
        this.currentState = this.config.startSpin ? STATES.Coasting : STATES.Resting;
        this.previousTime = null;
        this.inertiaSpeed = [this.config.startSpin, 0];
        this.initialInertia = 0.125;
        this.idle = false;
        Object.seal(this);
    }
    handleEvent(evt) {
        if (evt.pointerType === 'touch' && !evt.isPrimary) {
            return;
        }
        const pos = [evt.clientX, evt.clientY];
        if (evt.type === 'pointerdown') {
            this.startDrag(pos);
        }
        if (evt.type === 'pointerup') {
            this.endDrag(pos);
        }
        if (evt.type === 'pointermove' && evt.buttons) {
            this.updateDrag(pos);
        }
    }
    tick() {
        if (this.config.autoTick) {
            window.requestAnimationFrame(this.tick);
        }
        const time = Date.now();
        const state = this.currentState;
        if (this.previousTime == null) {
            this.previousTime = time;
        }
        const deltaTime = time - this.previousTime;
        this.previousTime = time;
        const isSpinning = state === STATES.DraggingSpin || state === STATES.DraggingInit;
        if (state === STATES.Coasting) {
            this.currentSpin += this.inertiaSpeed[0] * deltaTime;
            this.currentTilt += this.inertiaSpeed[1] * deltaTime;
            if (Math.abs(this.inertiaSpeed[0]) < 0.0001 &&
                    Math.abs(this.inertiaSpeed[1]) < 0.0001) {
                this.currentState = STATES.Resting;
            }
        } else if (isSpinning && vec2.equals(this.currentPosition, this.previous2Position)) {
            this.currentSpin += this.inertiaSpeed[0] * deltaTime;
            this.currentTilt += this.inertiaSpeed[1] * deltaTime;
        }
        this.inertiaSpeed[0] *= (1 - this.config.friction);
        this.inertiaSpeed[1] *= (1 - this.config.friction);
        this.previous2Position = this.previousPosition.slice();
        this.previousPosition = this.currentPosition.slice();
        const eps = 0.0001;
        this.idle = Math.abs(this.inertiaSpeed[0]) < eps && Math.abs(this.inertiaSpeed[1]) < eps;
    }
    startDrag(position) {
        this.startPosition = position.slice();
        this.currentPosition = position.slice();
        this.currentState = STATES.DraggingInit;
    }
    endDrag(position) {
        this.currentPosition = position.slice();
        [this.currentSpin, this.currentTilt] = this.getAngles();
        if (this.config.friction === 1) {
            this.currentState = STATES.Resting;
        } else {
            this.currentState = STATES.Coasting;
        }
    }
    updateDrag(position) {
        const [previousSpin, previousTilt] = this.getAngles();
        this.currentPosition = position.slice();
        const [currentSpin, currentTilt] = this.getAngles();
        this.inertiaSpeed[0] = this.initialInertia * (currentSpin - previousSpin);
        this.inertiaSpeed[1] = this.initialInertia * (currentTilt - previousTilt);
    }
    getMatrix() {
        const r = this.getAngles();
        const spin = mat4.fromRotation(mat4.create(), r[0], [0, 1, 0]);
        const tilt = mat4.fromRotation(mat4.create(), r[1], [1, 0, 0]);
        return mat4.multiply(tilt, tilt, spin);
    }
    isIdle() { return this.idle; }
    getAngles() {
        const delta = vec2.subtract(vec2.create(), this.currentPosition, this.startPosition);
        const config = this.config;
        let spin = this.currentSpin;
        let tilt = this.currentTilt;
        if (this.currentState === STATES.DraggingSpin) {
            spin += config.radiansPerPixel[0] * delta[0];
        } else if (this.currentState === STATES.DraggingTilt) {
            tilt += config.radiansPerPixel[1] * delta[1];
        } else if (this.currentState === STATES.DraggingInit) {
            spin += config.radiansPerPixel[0] * delta[0];
            tilt += config.radiansPerPixel[1] * delta[1];
        }
        tilt = Math.min(tilt, config.clampTilt);
        tilt = Math.max(tilt, -config.clampTilt);
        return [spin, tilt];
    }
}
