
// controller/phase_handlers.js
console.log('Loading phase_handlers.js');

import { detectFacing, calculateDtwScore } from '../utils/utils.js';
import { printTextOnFrame, drawDtwScores } from '../utils/camera_utils.js';
import { checkBendback } from './holding.js';

export class BasePhase {
    constructor(controller) {
        this.controller = controller;
        this.holdDuration = 3;
    }

    process(currentTime) {
        throw new Error('Not implemented');
    }
}

export class StartPhase extends BasePhase {
    constructor(controller, targetFacing) {
        super(controller);
        console.log(`StartPhase initialized with target facing: ${targetFacing}`);
        this.targetFacing = targetFacing;
    }

    process(currentTime) {
        console.log('Processing StartPhase');
        const detectedFacing = this.controller.landmarks ? detectFacing(this.controller.landmarks) : 'random';
        console.log(`StartPhase - Detected Facing: ${detectedFacing}, Target Facing: ${this.targetFacing}`);
        const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
        if (detectedFacing === this.targetFacing) {
            printTextOnFrame(this.controller.frame, `Starting pose (${this.targetFacing}) detected`, { x: 10, y: 60 }, 'green');
            if (currentTime - this.controller.startTime >= this.holdDuration) {
                console.log('Start phase completed');
                return [phase, true];
            }
        } else {
            printTextOnFrame(this.controller.frame, `Face ${this.targetFacing} to start`, { x: 10, y: 60 }, 'red');
        }
        return [phase, false];
    }
}

export class TransitionPhase extends BasePhase {
    process(currentTime) {
        console.log('Processing TransitionPhase');
        const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
        printTextOnFrame(this.controller.frame, 'Transitioning...', { x: 10, y: 60 }, 'yellow');
        if (currentTime - this.controller.startTime >= this.holdDuration) {
            console.log('Transition phase completed');
            return [phase, true];
        }
        return [phase, false];
    }
}





export class HoldingPhase extends BasePhase {
    constructor(controller, thresholds) {
        super(controller);
        console.log('HoldingPhase initialized with thresholds:', thresholds);
        this.thresholds = thresholds;
        this.holdStartTime = null;
        this.successDuration = 0;
        this.minHoldDuration = 2;
        this.completedHold = false;
        this.exitThresholdMultiplier = 1.1;
    }
    
    
    
    process(currentTime) {
        console.log("controller"+this.controller.normalizedKeypoints) ;
        console.log('Processing HoldingPhase');
        const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
        const idealKeypoints = this.controller.getIdealKeypoints(phase);
        console.log('Ideal keypoints for holding phase from phase handler:', idealKeypoints);


        if (this.controller.lastHoldingIdx !== -1 && 
            this.controller.currentSegmentIdx > this.controller.lastHoldingIdx && 
            this.controller.transitionKeypoints.length) {
            const idealTransKeypoints = this.controller.getTransitionKeypoints(this.controller.lastHoldingIdx, this.controller.currentSegmentIdx);
            if (idealTransKeypoints.length && this.controller.transitionKeypoints.length) {
                const minLen = Math.min(this.controller.transitionKeypoints.length, idealTransKeypoints.length);
                const userTrans = this.controller.transitionKeypoints.slice(0, minLen).flat();
                const idealTrans = idealTransKeypoints.slice(0, minLen).flat();
                const { dtwDistance } = calculateDtwScore(userTrans, idealTrans);
                const color = dtwDistance < 50 ? 'green' : 'red';
                printTextOnFrame(this.controller.frame, `Transition DTW: ${dtwDistance.toFixed(2)}`, { x: 10, y: 120 }, color);
            }
        }

        if (this.controller.normalizedKeypoints) {
            const [ctx, success] = checkBendback(this.controller.frame, idealKeypoints, this.controller.normalizedKeypoints, currentTime, this.thresholds);
            this.controller.frame = ctx;
            const { dtwDistance: dtwWhole } = calculateDtwScore(idealKeypoints, this.controller.normalizedKeypoints);
            const exitThreshold = this.thresholds[0] * this.exitThresholdMultiplier;

            // Draw DTW scores
            const scores = {
                [phase]: { value: dtwWhole, threshold: this.thresholds[0] }
            };
            drawDtwScores(this.controller.frame, scores);

            // Draw arrow from user wrist to ideal wrist position
            const width = this.controller.frame.canvas.width;
            const height = this.controller.frame.canvas.height;
            const userWrist = this.controller.normalizedKeypoints[15]; // LEFT_WRIST
            const idealWrist = idealKeypoints[15];
            const userWristPixel = [(userWrist[0] + 1) * width / 2, (userWrist[1] + 1) * height / 2];
            const idealWristPixel = [(idealWrist[0] + 1) * width / 2, (idealWrist[1] + 1) * height / 2];
            this.controller.frame.beginPath();
            this.controller.frame.moveTo(userWristPixel[0], userWristPixel[1]);
            this.controller.frame.lineTo(idealWristPixel[0], idealWristPixel[1]);
            this.controller.frame.strokeStyle = success ? 'green' : 'red';
            this.controller.frame.lineWidth = 3;
            this.controller.frame.stroke();
            // Draw arrowhead
            const angle = Math.atan2(idealWristPixel[1] - userWristPixel[1], idealWristPixel[0] - userWristPixel[0]);
            const arrowSize = 10;
            this.controller.frame.beginPath();
            this.controller.frame.moveTo(idealWristPixel[0], idealWristPixel[1]);
            this.controller.frame.lineTo(
                idealWristPixel[0] - arrowSize * Math.cos(angle + Math.PI / 6),
                idealWristPixel[1] - arrowSize * Math.sin(angle + Math.PI / 6)
            );
            this.controller.frame.moveTo(idealWristPixel[0], idealWristPixel[1]);
            this.controller.frame.lineTo(
                idealWristPixel[0] - arrowSize * Math.cos(angle - Math.PI / 6),
                idealWristPixel[1] - arrowSize * Math.sin(angle - Math.PI / 6)
            );
            this.controller.frame.stroke();
            console.log(`Arrow drawn from (${userWristPixel[0]}, ${userWristPixel[1]}) to (${idealWristPixel[0]}, ${idealWristPixel[1]})`);

            if (success) {
                if (!this.holdStartTime) this.holdStartTime = currentTime;
                this.successDuration = currentTime - this.holdStartTime;
                printTextOnFrame(this.controller.frame, `Holding ${phase} (${this.successDuration.toFixed(1)}s)`, { x: 10, y: 60 }, 'green');
                if (this.successDuration >= this.minHoldDuration && !this.completedHold) {
                    this.completedHold = true;
                    printTextOnFrame(this.controller.frame, 'Hold completed, stay or adjust to exit', { x: 10, y: 90 }, 'green');
                }
            } else {
                if (this.completedHold && dtwWhole > exitThreshold) {
                    const phaseName = phase.split('_')[1] || phase;
                    printTextOnFrame(this.controller.frame, `${phaseName} completed, exiting hold (DTW: ${dtwWhole.toFixed(2)})`, { x: 10, y: 60 }, 'green');
                    console.log('Holding phase completed');
                    return [phase, true];
                }
                if (!this.completedHold) {
                    this.holdStartTime = null;
                    this.successDuration = 0;
                    printTextOnFrame(this.controller.frame, 'Adjust pose to hold', { x: 10, y: 60 }, 'red');
                } else {
                    printTextOnFrame(this.controller.frame, `Hold completed, stay or adjust to exit (DTW: ${dtwWhole.toFixed(2)})`, { x: 10, y: 60 }, 'green');
                }
            }
        } else {
            printTextOnFrame(this.controller.frame, 'Adjust pose', { x: 10, y: 60 }, 'red');
            this.holdStartTime = null;
            this.successDuration = 0;
            this.completedHold = false;
        }
        return [phase, false];
    }
}

export class EndingPhase extends BasePhase {
    constructor(controller, targetFacing) {
        super(controller);
        console.log(`EndingPhase initialized with target facing: ${targetFacing}`);
        this.targetFacing = targetFacing;
    }

    process(currentTime) {
        console.log('Processing EndingPhase');
        const detectedFacing = this.controller.landmarks ? detectFacing(this.controller.landmarks) : 'random';
        console.log(`EndingPhase - Detected Facing: ${detectedFacing}, Target Facing: ${this.targetFacing}`);
        const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
        if (detectedFacing === this.targetFacing) {
            printTextOnFrame(this.controller.frame, 'Repetition completed', { x: 10, y: 60 }, 'green');
            if (currentTime - this.controller.startTime >= this.holdDuration) {
                console.log('Ending phase completed');
                return [phase, true];
            }
        } else {
            printTextOnFrame(this.controller.frame, `Face ${this.targetFacing} to end`, { x: 10, y: 60 }, 'red');
        }
        return [phase, false];
    }
}



