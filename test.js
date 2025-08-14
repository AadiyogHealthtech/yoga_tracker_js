// Consolidated Yoga Controller Implementation
console.log('Loading consolidated yoga controller');

/*********************
 * Utility Functions *
 *********************/
const utils = {
    normalizeKeypoints: (landmarks) => {
        if (!landmarks || landmarks.length === 0) return [null, null];
        const hip = landmarks[23]; // Left hip as reference
        const normalized = landmarks.map(l => [
            (l.x - hip.x) * 100,
            (l.y - hip.y) * 100,
            l.z
        ]);
        return [normalized, hip];
    },

    detectFacing: (landmarks) => {
        if (!landmarks || landmarks.length < 11) return null;
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        return leftShoulder.x > rightShoulder.x ? 'left' : 'right';
    },

    checkKeypointVisibility: (landmarks) => {
        const required = [0, 11, 12, 13, 14, 15, 16, 23, 24];
        const missing = required.filter(i => !landmarks[i] || landmarks[i].visibility < 0.5);
        return [missing.length === 0, missing];
    },

    calculateEuclideanDistance: (a, b) => {
        if (!a || !b || a.length !== b.length) return Infinity;
        return Math.sqrt(a.reduce((sum, _, i) => sum + Math.pow(a[i] - b[i], 2), 0));
    },

    calculateDtwScore: (seqA, seqB) => {
        if (!seqA.length || !seqB.length) return { dtwDistance: Infinity };
        const dtw = Array(seqA.length).fill().map(() => Array(seqB.length).fill(Infinity));
        dtw[0][0] = utils.calculateEuclideanDistance(seqA[0], seqB[0]);
        
        for (let i = 1; i < seqA.length; i++) {
            for (let j = 1; j < seqB.length; j++) {
                const cost = utils.calculateEuclideanDistance(seqA[i], seqB[j]);
                dtw[i][j] = cost + Math.min(dtw[i-1][j], dtw[i][j-1], dtw[i-1][j-1]);
            }
        }
        return { dtwDistance: dtw[seqA.length-1][seqB.length-1] };
    }
};

/***********************
 * Visualization Tools *
 ***********************/
const cameraUtils = {
    drawPoseSkeleton: (ctx, landmarks) => {
        if (!ctx || !landmarks) return;
        ctx.strokeStyle = '#00FF00';
        // Simplified skeleton drawing
        const connections = [[11,12], [11,13], [13,15], [12,14], [14,16], [23,24]];
        connections.forEach(([a, b]) => {
            ctx.beginPath();
            ctx.moveTo(landmarks[a].x * ctx.canvas.width, landmarks[a].y * ctx.canvas.height);
            ctx.lineTo(landmarks[b].x * ctx.canvas.width, landmarks[b].y * ctx.canvas.height);
            ctx.stroke();
        });
    },

    printTextOnFrame: (ctx, text, position, color = 'white') => {
        if (!ctx) return;
        ctx.fillStyle = color;
        ctx.font = '16px Arial';
        ctx.fillText(text, position.x, position.y);
    },

    drawGuidanceArrow: (ctx, start, end, width, height, isValid) => {
        if (!ctx || !start || !end) return;
        const scale = 0.5;
        const sx = (start[0] + 1) * width * scale;
        const sy = (start[1] + 1) * height * scale;
        const ex = (end[0] + 1) * width * scale;
        const ey = (end[1] + 1) * height * scale;
        
        ctx.strokeStyle = isValid ? '#00FF00' : '#FF0000';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
    }
};

/**********************
 * Data Management    *
 **********************/
class YogaDataExtractor {
    constructor() {
        this.data = {
            segments: [
                { phase: 'start', type: 'starting', facing: 'front', thresholds: [0.1] },
                { phase: 'transition1', type: 'transition', facing: 'left' },
                { phase: 'hold', type: 'holding', thresholds: [0.2], facing: 'left' },
                { phase: 'end', type: 'ending', facing: 'front' }
            ]
        };
    }

    segments() {
        return this.data.segments;
    }

    getIdealKeypoints() {
        // Mock ideal keypoints for testing
        return Array(33).fill().map(() => [Math.random()*2-1, Math.random()*2-1, 0]);
    }
}

class TransitionAnalyzer {
    constructor() {
        this.transitionData = [];
    }

    getTransitionEndTarget() {
        return { x: 0.5, y: 0.5 }; // Mock target position
    }
}

/**********************
 * Phase Handlers     *
 **********************/
class BasePhase {
    constructor(controller) {
        this.controller = controller;
        this.holdDuration = 3000; // 3 seconds
    }

    process() {
        throw new Error('Not implemented');
    }
}

class StartPhase extends BasePhase {
    process(currentTime) {
        const phase = 'start';
        const targetFacing = 'front';
        const detectedFacing = utils.detectFacing(this.controller.landmarks);
        
        if (detectedFacing === targetFacing) {
            cameraUtils.printTextOnFrame(this.controller.frame, `Start facing ${targetFacing}`, {x: 10, y: 60}, 'green');
            if (currentTime - this.controller.startTime >= this.holdDuration) {
                return [phase, true];
            }
        }
        return [phase, false];
    }
}

class TransitionPhase extends BasePhase {
    process(currentTime) {
        const phase = 'transition';
        const elapsed = currentTime - this.controller.startTime;
        cameraUtils.printTextOnFrame(
            this.controller.frame,
            `Transition: ${(this.holdDuration - elapsed)/1000}s`,
            {x: 10, y: 60},
            'yellow'
        );
        return [phase, elapsed >= this.holdDuration];
    }
}

class HoldingPhase extends BasePhase {
    process(currentTime) {
        const phase = 'hold';
        const idealKeypoints = this.controller.getIdealKeypoints();
        const userKeypoints = this.controller.normalizedKeypoints;
        const distance = utils.calculateEuclideanDistance(userKeypoints, idealKeypoints);

        cameraUtils.drawGuidanceArrow(
            this.controller.frame,
            userKeypoints[15],
            idealKeypoints[15],
            this.controller.frame.canvas.width,
            this.controller.frame.canvas.height,
            distance < 0.2
        );

        return [phase, distance < 0.2 && (currentTime - this.controller.startTime) > 2000];
    }
}

class EndingPhase extends BasePhase {
    process(currentTime) {
        const phase = 'end';
        const targetFacing = 'front';
        const detectedFacing = utils.detectFacing(this.controller.landmarks);
        
        if (detectedFacing === targetFacing && 
           (currentTime - this.controller.startTime) > this.holdDuration) {
            return [phase, true];
        }
        return [phase, false];
    }
}

/**********************
 * Main Controller    *
 **********************/
class Controller {
    constructor() {
        this.exercisePlan = { 
            sun_salutation: { json_path: '', reps: 3 } 
        };
        this.currentExercise = 'sun_salutation';
        this.targetReps = 3;
        this.count = 0;
        this.currentSegmentIdx = 0;
        this.startTime = performance.now();
        this.landmarks = null;
        this.normalizedKeypoints = null;
        this.frame = document.createElement('canvas').getContext('2d');
        
        this.yoga = new YogaDataExtractor();
        this.segments = this.yoga.segments();
        this.phaseHandlers = {
            start: new StartPhase(this),
            transition: new TransitionPhase(this),
            hold: new HoldingPhase(this),
            end: new EndingPhase(this)
        };
    }

    updateFrame(results) {
        this.landmarks = results?.poseLandmarks;
        [this.normalizedKeypoints] = utils.normalizeKeypoints(this.landmarks);
    }

    processExercise() {
        const currentTime = performance.now();
        const currentPhase = this.segments[this.currentSegmentIdx].type;
        const handler = this.phaseHandlers[currentPhase];
        const [phase, completed] = handler.process(currentTime);

        if (completed) {
            this.currentSegmentIdx = (this.currentSegmentIdx + 1) % this.segments.length;
            if (phase === 'end') this.handleRepCompletion(currentTime);
            this.startTime = currentTime;
        }

        cameraUtils.drawPoseSkeleton(this.frame, this.landmarks);
        return [phase, this.currentExercise, this.count, this.targetReps];
    }

    handleRepCompletion() {
        this.count++;
        if (this.count >= this.targetReps) {
            console.log('Exercise completed!');
            this.count = 0;
        }
    }
}

/**********************
 * Testing Setup      *
 **********************/
// Example test usage
const controller = new Controller();
const mockLandmarks = Array(33).fill().map((_, i) => ({
    x: Math.random(),
    y: Math.random(),
    z: 0,
    visibility: 1
}));

// Simulate frame processing
function testCycle() {
    controller.updateFrame({ poseLandmarks: mockLandmarks });
    const [phase] = controller.processExercise();
    console.log(`Current phase: ${phase}, Reps: ${controller.count}`);
    
    if (controller.count < 3) setTimeout(testCycle, 1000);
}

testCycle();