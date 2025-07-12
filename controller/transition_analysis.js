



// controller/transition_analysis.js
console.log('Loading transition_analysis.js');

import { YogaDataExtractor } from './yoga.js';
import { printTextOnFrame, drawTransitionPath } from '../utils/camera_utils.js';

export class TransitionAnalyzer {
    constructor(jsonPath, yogaName) {
        console.log(`Creating TransitionAnalyzer for ${yogaName} with JSON: ${jsonPath}`);
        this.yoga = new YogaDataExtractor(jsonPath);
        this.yogaName = yogaName;
        this.segments = this.yoga.segments();
        this.transitionPaths = this._createTransitionPaths();
        console.log('Transition paths created:', this.transitionPaths);
    }
    analyzeTransitionduringphase(ctx, normalizedKeypoints, currentSegmentIdx, hipPoint) {
        // 1) reset per‐segment queue
        if (this._queueSegmentIdx !== currentSegmentIdx) {
            this._queueSegmentIdx = currentSegmentIdx;
            this._pointQueue = [];

            // find the active transition path
            const path = this.transitionPaths.find(p =>
                currentSegmentIdx > p.startSegmentIdx && currentSegmentIdx < p.endSegmentIdx
            );
            if (!path) return [ctx, true];

            // grab the “ideal” frames & joints we care about
            const idealFrames = this.yoga.getIdealKeypoints(path.startFrame, path.endFrame);
            const joints = [11,12,13,14,15,16,25,26,27,28];

            // enqueue every joint (with hip offset)
            for (const frame of idealFrames) {
                for (const idx of joints) {
                    const rel = frame[idx];
                    this._pointQueue.push([
                        rel[0] + hipPoint[0],
                        rel[1] + hipPoint[1]
                    ]);
                }
            }
            this._originalLength = this._pointQueue.length;
        }

        if (!this._pointQueue.length) return [ctx, true];

        // pick the next target
        const target = this._pointQueue[0];
        const [tx, ty] = this._toPixelCoords(target, ctx.canvas.width, ctx.canvas.height);

        // determine which joint this is in the sequence
        const done       = this._pointQueue.length;
        const joints     = [11,12,13,14,15,16,25,26,27,28];
        const jointIdx   = joints[(this._originalLength - done) % joints.length];

        // ---- DRAW ONLY WRISTS (15 & 16) ----
        if (jointIdx === 15 || jointIdx === 16) {
            ctx.beginPath();
            ctx.arc(tx, ty, 8, 0, Math.PI * 2);
            ctx.strokeStyle = 'cyan';
            ctx.lineWidth   = 2;
            ctx.stroke();
        }

        // compare user → same hip‐relative offset
        const userRel = normalizedKeypoints[jointIdx];
        const [ux, uy] = this._toPixelCoords(
            [ userRel[0] + hipPoint[0], userRel[1] + hipPoint[1] ],
            ctx.canvas.width,
            ctx.canvas.height
        );

        // if the user’s joint is close enough → pop this target
        const dist = Math.hypot(tx - ux, ty - uy);
        if (dist <= 20) {
            this._pointQueue.shift();
        }

        return [ctx, this._pointQueue.length === 0];
    }

    _createTransitionPaths() {
        console.log('Creating transition paths');
        const transitionPaths = [];
        const holdingIndices = this.segments
            .map((seg, i) => seg.type === 'starting' || seg.type === 'holding' || seg.type === 'ending' ? i : -1)
            .filter(i => i !== -1);

        for (let i = 0; i < holdingIndices.length - 1; i++) {
            const startIdx = holdingIndices[i];
            const endIdx = holdingIndices[i + 1];
            const startFrame = this.segments[startIdx].end;
            const endFrame = this.segments[endIdx].start;
            if (startFrame >= endFrame) continue;

            const idealKeypoints = this.yoga.getIdealKeypoints(startFrame, endFrame);
            if (!idealKeypoints.length) continue;

            const leftWristKeypoints = idealKeypoints.map(frame => frame[15]);
            const threshold = this.segments[endIdx].thresholds ? this.segments[endIdx].thresholds[0] : 0.1;
            transitionPaths.push({
                startSegmentIdx: startIdx,
                endSegmentIdx: endIdx,
                startFrame,
                endFrame,
                leftWristPath: leftWristKeypoints,
                threshold
            });
        }
        console.log('Transition paths:', transitionPaths);
        return transitionPaths;
    }

    analyzeTransition(ctx, userKeypoints, currentSegmentIdx) {
        console.log('Analyzing transition for segment:', currentSegmentIdx);
        const userLeftWrist = userKeypoints[15];
        for (const path of this.transitionPaths) {
            if (currentSegmentIdx > path.startSegmentIdx && currentSegmentIdx < path.endSegmentIdx) {
                drawTransitionPath(ctx, path.leftWristPath, userKeypoints, path.threshold);
                const distances = path.leftWristPath.map(p => Math.hypot(userLeftWrist[0] - p[0], userLeftWrist[1] - p[1]));
                const minDistance = Math.min(...distances);
                const withinPath = minDistance <= path.threshold;
                const color = withinPath ? 'green' : 'red';
                printTextOnFrame(ctx, `Transition: ${withinPath ? 'Within Path' : 'Off Path'} (Dist: ${minDistance.toFixed(2)})`, { x: 10, y: 90 }, color);
                return [ctx, withinPath];
            }
        }
        return [ctx, false];
    }

    // transition_analysis.js
    _toPixelCoords(point, width, height) {
        // Handle array or object format
        const x = point.x ?? point[0] ?? 0;
        const y = point.y ?? point[1] ?? 0;

        const safeWidth = width || 1280;
        const safeHeight = height || 720;

        return [
            (x) * safeWidth ,
            (y) * safeHeight 
        ];
    }
    getTransitionEndTarget(currentSegmentIdx) {
        for (const path of this.transitionPaths) {
            if (currentSegmentIdx > path.startSegmentIdx && currentSegmentIdx <= path.endSegmentIdx) {
                return path.leftWristPath[path.leftWristPath.length - 1];
            }
        }
        return [0, 0, 0];
    }
}

export function integrateWithController(controller, transitionAnalyzer) {
    console.log('Integrating TransitionAnalyzer with Controller');
    const originalProcessExercise = controller.processExercise;
    controller.processExercise = function(currentTime) {
        const [phase, exerciseName, count, targetReps] = originalProcessExercise.call(this, currentTime);
        const currentSegment = this.segments[this.currentSegmentIdx];

        if (this.normalizedKeypoints) {
            const width = this.frame.canvas.width;
            const height = this.frame.canvas.height;
            const userLeftWrist = this.normalizedKeypoints[15];
            console.info(`User wrist position is: ${userLeftWrist}`);
            const userWristPixel = transitionAnalyzer._toPixelCoords(userLeftWrist, width, height);

            for (const path of transitionAnalyzer.transitionPaths) {
                if (this.currentSegmentIdx > path.startSegmentIdx && this.currentSegmentIdx <= path.endSegmentIdx) {
                    drawTransitionPath(this.frame, path.leftWristPath, this.normalizedKeypoints, path.threshold);

                    if (currentSegment.type !== 'starting' && currentSegment.type !== 'holding' && currentSegment.type !== 'ending') {
                        const [ctx, withinPath] = transitionAnalyzer.analyzeTransition(this.frame, this.normalizedKeypoints, this.currentSegmentIdx);
                        this.frame = ctx;
                        if (withinPath) {
                            const targetWrist = transitionAnalyzer.getTransitionEndTarget(this.currentSegmentIdx);
                            
                            console.info("working till here")
                            const targetPixel = transitionAnalyzer._toPixelCoords(targetWrist, width, height);
                            this.frame.beginPath();
                            this.frame.moveTo(userWristPixel[0], userWristPixel[1]);
                            this.frame.lineTo(targetPixel[0], targetPixel[1]);
                            this.frame.strokeStyle = 'green';
                            this.frame.lineWidth = 3;
                            this.frame.stroke();
                        }
                    } else if (['starting', 'holding', 'ending'].includes(currentSegment.type) && path.endSegmentIdx === this.currentSegmentIdx) {
                        const handler = this.phaseHandlers[currentSegment.handlerKey];
                        const [, completed] = handler.process(currentTime);
                        if (!completed) {
                            drawTransitionPath(this.frame, path.leftWristPath, this.normalizedKeypoints, path.threshold);
                            const idealKeypoints = this.getIdealKeypoints(currentSegment.phase);
                            if (idealKeypoints.length) {
                                const targetWrist = idealKeypoints[15];
                                console.info("working till here")
                                const targetPixel = transitionAnalyzer._toPixelCoords(targetWrist, width, height);
                                this.frame.beginPath();
                                this.frame.moveTo(userWristPixel[0], userWristPixel[1]);
                                this.frame.lineTo(targetPixel[0], targetPixel[1]);
                                this.frame.strokeStyle = 'green';
                                this.frame.lineWidth = 3;
                                this.frame.stroke();
                            }
                        }
                    }
                }
            }
        }
        return [phase, exerciseName, count, targetReps];
    };
}