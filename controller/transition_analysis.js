



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

    _toPixelCoords(point, width, height) {
        return [(point[0] + 1) * width / 2, (point[1] + 1) * height / 2];
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
            const userWristPixel = transitionAnalyzer._toPixelCoords(userLeftWrist, width, height);

            for (const path of transitionAnalyzer.transitionPaths) {
                if (this.currentSegmentIdx > path.startSegmentIdx && this.currentSegmentIdx <= path.endSegmentIdx) {
                    drawTransitionPath(this.frame, path.leftWristPath, this.normalizedKeypoints, path.threshold);

                    if (currentSegment.type !== 'starting' && currentSegment.type !== 'holding' && currentSegment.type !== 'ending') {
                        const [ctx, withinPath] = transitionAnalyzer.analyzeTransition(this.frame, this.normalizedKeypoints, this.currentSegmentIdx);
                        this.frame = ctx;
                        if (withinPath) {
                            const targetWrist = transitionAnalyzer.getTransitionEndTarget(this.currentSegmentIdx);
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