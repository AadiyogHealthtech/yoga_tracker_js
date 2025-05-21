
// controller/controller.js
console.log('Loading controller.js');
import { StartPhase, TransitionPhase, HoldingPhase, EndingPhase, RelaxationPhase } from './phase_handlers.js';

import { normalizeKeypoints, detectFacing, checkKeypointVisibility, calculateDtwScore } from '../utils/utils.js';
import { drawPoseSkeleton, printTextOnFrame, drawDtwScores, drawTransitionPath, drawGuidanceArrow } from '../utils/camera_utils.js';
import { YogaDataExtractor } from './yoga.js';
import { TransitionAnalyzer, integrateWithController } from './transition_analysis.js';

console.log('All controller dependencies imported');

export class Controller {
    constructor(exercisePlan) {
        console.log('Constructing Controller with exercise plan:', exercisePlan);
        this.lastValidPoseTime = performance.now();  // Milliseconds
        this.inRelaxation = false;
        this.relaxationEnteredTime = 0;
        this.relaxationThreshold = 5;  // Seconds (converted to ms in checks)

        // Frame and processing properties
        this.frame = null;
        this.results = null;
        
        // Exercise plan properties
        this.exercisePlan = exercisePlan;
        this.currentExerciseIdx = 0;
        this.exerciseNames = Object.keys(exercisePlan);
        this.currentExercise = this.exerciseNames[this.currentExerciseIdx];
        this.jsonPath = exercisePlan[this.currentExercise].json_path;
        this.targetReps = exercisePlan[this.currentExercise].reps;
        
        // Yoga data components
        this.yoga = new YogaDataExtractor(this.jsonPath);
        this.segments = this.yoga.segments();  // Initialize from YogaDataExtractor
        this.currentSegmentIdx = 0;
        
        // Phase handling
        this.phaseHandlers = this._initializeHandlers();  // Initialize properly
        
        // Rep tracking
        this.count = 0;
        this.startTime = performance.now();  // Milliseconds
        this.currentRepStartTime = null;
        
        // Pose data
        this.landmarks = null;
        this.normalizedKeypoints = null;
        this.transitionKeypoints = [];
        
        // Analysis tools
        this.lastHoldingIdx = -1;
        this.transitionAnalyzer = new TransitionAnalyzer(this.jsonPath, this.currentExercise);
    }

    async initialize() {
        console.log('Initializing YogaDataExtractor');
        await this.yoga.ensureLoaded();
        console.log("Data loaded and exercise initialized");
        this.segments = this.yoga.segments();
        console.log('Segments initialized:', this.segments);
        if (this.segments.length === 0) {
            console.error('No segments available, exercise cannot start');
            return;
        }
        this.phaseHandlers = this._initializeHandlers();
        console.log('Phase handlers initialized:', Object.keys(this.phaseHandlers));
        integrateWithController(this, this.transitionAnalyzer);
        console.log('Transition analyzer integrated');
    }

    _initializeHandlers() {
        const handlers = {};
        this.segments.forEach((segment, i) => {
            const phase = segment.phase;
            const phaseType = segment.type;
            const uniqueKey = `${phase}_${i}`;
            const startFacing = segment.facing; // Directly use segment's facing

            if (phaseType === 'starting') {
                handlers[uniqueKey] = new StartPhase(this, startFacing);
            } else if (phaseType === 'transition') {
                handlers[uniqueKey] = new TransitionPhase(this, startFacing); // Pass facing
            } else if (phaseType === 'holding') {
                handlers[uniqueKey] = new HoldingPhase(this, segment.thresholds, startFacing); // Add facing
            } else if (phaseType === 'ending') {
                handlers[uniqueKey] = new EndingPhase(this, startFacing);
            }
            segment.handlerKey = uniqueKey;
        });
        return handlers;
    }

    startExerciseSequence() {
        console.log(`Starting exercise sequence for ${this.currentExercise}`);
    }

    updateFrame(results) {
        console.log('Updating frame with results:', results);
        this.results = results;
        if (!results || !results.poseLandmarks) {
            console.warn('No pose landmarks detected');
            this.landmarks = null;
            this.normalizedKeypoints = null;
            return; // Don't update lastValidPoseTime here!
        }

        // Only update time when valid pose detected
        this.landmarks = results.poseLandmarks;
        const [allVisible, missing] = checkKeypointVisibility(this.landmarks);
        if (allVisible) {
            this.normalizedKeypoints = normalizeKeypoints(this.landmarks);
            console.log('Normalized keypoints:', this.normalizedKeypoints);
        } else {
            this.normalizedKeypoints = null;
            console.log(`Missing keypoints: ${missing.join(', ')}`);
        }
    }
    shouldEnterRelaxation(currentTime) {
        // Check for no valid pose
        const currentSegment = this.segments[this.currentSegmentIdx];
        if (['starting', 'ending'].includes(currentSegment?.type)) {
            const targetFacing = currentSegment.facing || 'front';
            return detectFacing(this.landmarks) !== targetFacing;
        }

        if (!this.normalizedKeypoints) {
            const elapsed = currentTime - this.lastValidPoseTime;
            return elapsed > this.relaxationThreshold * 1000;
        }
        // Check transition timeout
        if (currentSegment?.type === 'transition') {
            const transitionTimeout = 10000; // 10 seconds
            return (currentTime - this.startTime) > transitionTimeout;
        }

        return false;
    }

    handleRelaxationPhase(currentTime) {
        /** Process relaxation phase */
        if (!this.inRelaxation) {
            this.inRelaxation = true;
            this.relaxationEnteredTime = currentTime;
            console.log("Entering relaxation phase");
        }

        const handler = new RelaxationPhase(this);
        const { phase, completed } = handler.process(currentTime);

        // Check exit conditions
        if (completed || (currentTime - this.relaxationEnteredTime) > 30000) {
            this.inRelaxation = false;
            this.lastValidPoseTime = currentTime;
            console.log("Exiting relaxation phase");
        }
    }

    getRelaxationReturnValues() {
        /** Return values when in relaxation phase */
        return [
            phase,
            this.currentExercise,
            this.count,
            this.targetReps
        ];

    }
    processExercise(currentTime) {
       https://app.eraser.io/workspace/1wrbatFBIxQ5KGRRmJQt?origin=share
        if (!this.frame || !(this.frame instanceof CanvasRenderingContext2D)) {
            console.warn('No valid frame context available to process');
            return ['waiting', this.currentExercise, this.count, this.targetReps];
        }
        if (!this.results) {
            console.warn('No pose results available');
            return ['waiting', this.currentExercise, this.count, this.targetReps];
        }
        
        if (!this.segments || this.segments.length === 0) {
            console.warn('Segments are not initialized');
            return ['waiting', this.currentExercise, this.count, this.targetReps];
        }
        
        const currentSegment = this.segments[this.currentSegmentIdx];
        const handler = this.phaseHandlers[currentSegment.handlerKey];
        const [nextPhase, completed] = handler.process(currentTime);
        console.log(`Processing segment: ${currentSegment.phase}, Completed: ${completed}`);

        if (currentSegment.type === 'transition' && this.normalizedKeypoints) {
           
            this.transitionKeypoints.push(this.normalizedKeypoints);
            console.log('Added transition keypoints:', this.transitionKeypoints.length);
            drawTransitionPath(this.frame, this.transitionAnalyzer.getTransitionEndTarget(this.currentSegmentIdx), this.normalizedKeypoints, 0.1);
        }

        if (this.landmarks && currentSegment.type !== 'transition') {
            drawPoseSkeleton(this.frame, this.landmarks);
            console.log('Pose skeleton drawn for phase:', currentSegment.phase);
        }

        if (currentSegment.type === 'holding' && this.normalizedKeypoints) {
            const idealKeypoints = this.getIdealKeypoints(currentSegment.phase);
            if (idealKeypoints.length) {
                const dtwResult = calculateDtwScore(idealKeypoints, this.normalizedKeypoints);
                console.log('DTW result for holding phase:', dtwResult);
                if (dtwResult && typeof dtwResult.dtwDistance === 'number') {
                    const scores = {
                        [currentSegment.phase]: { value: dtwResult.dtwDistance, threshold: currentSegment.thresholds[0] }
                    };
                    drawDtwScores(this.frame, scores);
                    console.log('DTW scores drawn:', scores);

                    const userWrist = this.normalizedKeypoints[15]; // LEFT_WRIST
                    const idealWrist = idealKeypoints[15];
                    const width = this.frame.canvas.width;
                    const height = this.frame.canvas.height;
                    const success = dtwResult.dtwDistance < currentSegment.thresholds[0];
                    console.log('Drawing guidance arrow with:', { userWrist, idealWrist, width, height, success });
                    drawGuidanceArrow(this.frame, userWrist, idealWrist, width, height, success);
                } else {
                    console.warn('Invalid DTW result, skipping arrow and scores:', dtwResult);
                }
            } else {
                console.warn('No ideal keypoints available for holding phase drawing');
            }
        }

        if (completed) {
            if (currentSegment.type === 'holding') {
                this.lastHoldingIdx = this.currentSegmentIdx;
                this.transitionKeypoints = [];
                console.log('Holding phase completed, reset transition keypoints');
            }
            if (currentSegment.type === 'ending') {
                this.count++;
                console.log(`Repetition ${this.count} completed for ${this.currentExercise}`);
                if (this.count >= this.targetReps && this.currentExerciseIdx < this.exerciseNames.length - 1) {
                    this.currentExerciseIdx++;
                    this.currentExercise = this.exerciseNames[this.currentExerciseIdx];
                    this.jsonPath = this.exercisePlan[this.currentExercise].json_path;
                    this.targetReps = this.exercisePlan[this.currentExercise].reps;
                    this.yoga = new YogaDataExtractor(this.jsonPath);
                    this.segments = this.yoga.segments();
                    this.phaseHandlers = this._initializeHandlers();
                    this.transitionAnalyzer = new TransitionAnalyzer(this.jsonPath, this.currentExercise);
                    integrateWithController(this, this.transitionAnalyzer);
                    this.count = 0;
                    console.log(`Switched to next exercise: ${this.currentExercise}`);
                }
                this.currentSegmentIdx = 0;
                this.lastHoldingIdx = -1;
                this.transitionKeypoints = [];
                this.startTime = currentTime;
            } else if (this.currentSegmentIdx < this.segments.length - 1) {
                this.currentSegmentIdx++;
                this.startTime = currentTime;
                console.log(`Moved to next segment: ${this.currentSegmentIdx}`);
            }
        }

        return [currentSegment.phase, this.currentExercise, this.count, this.targetReps];
    }

    getIdealKeypoints(phase) {
        const segment = this.segments[this.currentSegmentIdx];
        if (segment.phase === phase) {
            const middle = Math.floor((segment.start + segment.end) / 2);
            return this.yoga.getIdealKeypoints(middle, middle + 1)[0] || [];
        }
        return [];
    }

    getTransitionKeypoints(startIdx, endIdx) {
        for (let i = startIdx; i < endIdx; i++) {
            if (this.segments[i].type === 'transition') {
                return this.yoga.getIdealKeypoints(this.segments[i].start, this.segments[i].end);
            }
        }
        return [];
    }
}




// controller/controller.js
// console.log('Loading controller.js');

// import { normalizeKeypoints, detectFacing, checkKeypointVisibility, calculateDtwScore } from '../utils/utils.js';
// import { drawPoseSkeleton, printTextOnFrame, drawDtwScores, drawTransitionPath, drawGuidanceArrow } from '../utils/camera_utils.js';
// import { YogaDataExtractor } from './yoga.js';
// import { StartPhase, TransitionPhase, HoldingPhase, EndingPhase } from './phase_handlers.js';
// import { TransitionAnalyzer, integrateWithController } from './transition_analysis.js';

// console.log('All controller dependencies imported');

// export class Controller {
//     constructor(exercisePlan) {
//         console.log('Constructing Controller with exercise plan:', exercisePlan);
//         this.frame = null;
//         this.results = null;
//         this.exercisePlan = exercisePlan;
//         this.currentExerciseIdx = 0;
//         this.exerciseNames = Object.keys(exercisePlan);
//         this.currentExercise = this.exerciseNames[this.currentExerciseIdx];
//         this.jsonPath = exercisePlan[this.currentExercise].json_path;
//         this.targetReps = exercisePlan[this.currentExercise].reps;
//         this.yoga = new YogaDataExtractor(this.jsonPath);
//         this.segments = [];
//         this.currentSegmentIdx = 0;
//         this.phaseHandlers = {};
//         this.count = 0;
//         this.startTime = performance.now() / 1000;
//         this.landmarks = null;
//         this.normalizedKeypoints = null;
//         this.transitionKeypoints = [];
//         this.lastHoldingIdx = -1;
//         this.transitionAnalyzer = new TransitionAnalyzer(this.jsonPath, this.currentExercise);
//     }

//     async initialize() {
//         console.log('Initializing YogaDataExtractor');
//         await this.yoga.ensureLoaded();
//         console.log("Data loaded and exercise initialized");
//         this.segments = this.yoga.segments();
//         console.log('Segments initialized:', this.segments);
//         if (this.segments.length === 0) {
//             console.error('No segments available, exercise cannot start');
//             return;
//         }
//         this.phaseHandlers = this._initializeHandlers();
//         console.log('Phase handlers initialized:', Object.keys(this.phaseHandlers));
//         integrateWithController(this, this.transitionAnalyzer);
//         console.log('Transition analyzer integrated');
//     }

//     _initializeHandlers() {
//         console.log('Initializing phase handlers');
//         const handlers = {};
//         this.segments.forEach((segment, i) => {
//             const phase = segment.phase;
//             const phaseType = segment.type;
//             const uniqueKey = `${phase}_${i}`;
//             let startFacing = segment.facing;

//             if (phaseType === 'starting' || phaseType === 'ending') {
//                 const idealKeypoints = this.yoga.getIdealKeypoints(segment.start, segment.end);
//                 const middleIdx = Math.floor(idealKeypoints.length / 2);
//                 const keypointsFrame = idealKeypoints[middleIdx] || [];
//                 console.log(`Segment ${uniqueKey} - Raw ideal keypoints sample:`, keypointsFrame.slice(0, 5));
//                 if (keypointsFrame.length >= 33) {
//                     const normalizedIdealKeypoints = normalizeKeypoints(keypointsFrame);
//                     console.log(`Segment ${uniqueKey} - Normalized ideal keypoints sample:`, normalizedIdealKeypoints?.slice(0, 5));
//                     if (normalizedIdealKeypoints) {
//                         const calculatedFacing = detectFacing(normalizedIdealKeypoints);
//                         console.log(`Segment ${uniqueKey} - Calculated facing: ${calculatedFacing}, Precomputed facing: ${segment.facing}`);
//                         startFacing = calculatedFacing !== 'random' ? calculatedFacing : segment.facing;
//                     }
//                 } else {
//                     console.warn(`Segment ${uniqueKey} - Insufficient keypoints for facing detection, using precomputed: ${startFacing}`);
//                 }
//             }
//             console.log(`Handler for ${uniqueKey} - Start Facing: ${startFacing}`);

//             if (phaseType === 'starting') handlers[uniqueKey] = new StartPhase(this, startFacing);
//             else if (phaseType === 'transition') handlers[uniqueKey] = new TransitionPhase(this);
//             else if (phaseType === 'holding') handlers[uniqueKey] = new HoldingPhase(this, segment.thresholds);
//             else if (phaseType === 'ending') handlers[uniqueKey] = new EndingPhase(this, startFacing);
//             segment.handlerKey = uniqueKey;
//         });
//         return handlers;
//     }

//     startExerciseSequence() {
//         console.log(`Starting exercise sequence for ${this.currentExercise}`);
//     }

//     updateFrame(results) {
//         console.log('Updating frame with results:', results);
//         this.results = results;
//         if (!results || !results.poseLandmarks) {
//             console.warn('No pose landmarks detected');
//             this.landmarks = null;
//             this.normalizedKeypoints = null;
//             return;
//         }
//         this.landmarks = results.poseLandmarks;
//         const [allVisible, missing] = checkKeypointVisibility(this.landmarks);
//         if (allVisible) {
//             this.normalizedKeypoints = normalizeKeypoints(this.landmarks);
//             console.log('Normalized keypoints:', this.normalizedKeypoints);
//         } else {
//             this.normalizedKeypoints = null;
//             console.log(`Missing keypoints: ${missing.join(', ')}`);
//         }
//     }

//     processExercise(currentTime) {
//         if (!this.frame || !(this.frame instanceof CanvasRenderingContext2D)) {
//             console.warn('No valid frame context available to process');
//             return ['waiting', this.currentExercise, this.count, this.targetReps];
//         }
//         if (!this.results) {
//             console.warn('No pose results available');
//             return ['waiting', this.currentExercise, this.count, this.targetReps];
//         }
//         if (!this.segments || this.segments.length === 0) {
//             console.warn('Segments are not initialized');
//             return ['waiting', this.currentExercise, this.count, this.targetReps];
//         }

//         const currentSegment = this.segments[this.currentSegmentIdx];
//         const handler = this.phaseHandlers[currentSegment.handlerKey];
//         const [nextPhase, completed] = handler.process(currentTime);
//         console.log(`Processing segment: ${currentSegment.phase}, Completed: ${completed}`);

//         if (currentSegment.type === 'transition' && this.normalizedKeypoints) {
//             this.transitionKeypoints.push(this.normalizedKeypoints);
//             console.log('Added transition keypoints:', this.transitionKeypoints.length);
//             drawTransitionPath(this.frame, this.transitionAnalyzer.getTransitionEndTarget(this.currentSegmentIdx), this.normalizedKeypoints, 0.1);
//         }

//         if (this.landmarks && currentSegment.type !== 'transition') {
//             drawPoseSkeleton(this.frame, this.landmarks);
//             console.log('Pose skeleton drawn for phase:', currentSegment.phase);
//         }

//         if (currentSegment.type === 'holding' && this.normalizedKeypoints) {
//             const idealKeypoints = this.getIdealKeypoints(currentSegment.phase);
//             if (idealKeypoints.length) {
//                 const dtwResult = calculateDtwScore(idealKeypoints, this.normalizedKeypoints);
//                 console.log('DTW result for holding phase:', dtwResult);
//                 if (dtwResult && typeof dtwResult.dtwDistance === 'number') {
//                     const scores = {
//                         [currentSegment.phase]: { value: dtwResult.dtwDistance, threshold: currentSegment.thresholds[0] }
//                     };
//                     drawDtwScores(this.frame, scores);
//                     console.log('DTW scores drawn:', scores);

//                     const userWrist = this.normalizedKeypoints[15]; // LEFT_WRIST
//                     const idealWrist = idealKeypoints[15];
//                     const width = this.frame.canvas.width;
//                     const height = this.frame.canvas.height;
//                     const success = dtwResult.dtwDistance < currentSegment.thresholds[0];
//                     console.log('Drawing guidance arrow with:', { userWrist, idealWrist, width, height, success });
//                     drawGuidanceArrow(this.frame, userWrist, idealWrist, width, height, success);
//                 } else {
//                     console.warn('Invalid DTW result, skipping arrow and scores:', dtwResult);
//                 }
//             } else {
//                 console.warn('No ideal keypoints available for holding phase drawing');
//             }
//         }

//         if (completed) {
//             if (currentSegment.type === 'holding') {
//                 this.lastHoldingIdx = this.currentSegmentIdx;
//                 this.transitionKeypoints = [];
//                 console.log('Holding phase completed, reset transition keypoints');
//             }
//             if (currentSegment.type === 'ending') {
//                 this.count++;
//                 console.log(`Repetition ${this.count} completed for ${this.currentExercise}`);
//                 if (this.count >= this.targetReps && this.currentExerciseIdx < this.exerciseNames.length - 1) {
//                     this.currentExerciseIdx++;
//                     this.currentExercise = this.exerciseNames[this.currentExerciseIdx];
//                     this.jsonPath = this.exercisePlan[this.currentExercise].json_path;
//                     this.targetReps = this.exercisePlan[this.currentExercise].reps;
//                     this.yoga = new YogaDataExtractor(this.jsonPath);
//                     this.segments = this.yoga.segments();
//                     this.phaseHandlers = this._initializeHandlers();
//                     this.transitionAnalyzer = new TransitionAnalyzer(this.jsonPath, this.currentExercise);
//                     integrateWithController(this, this.transitionAnalyzer);
//                     this.count = 0;
//                     console.log(`Switched to next exercise: ${this.currentExercise}`);
//                 }
//                 this.currentSegmentIdx = 0;
//                 this.lastHoldingIdx = -1;
//                 this.transitionKeypoints = [];
//                 this.startTime = currentTime;
//             } else if (this.currentSegmentIdx < this.segments.length - 1) {
//                 this.currentSegmentIdx++;
//                 this.startTime = currentTime;
//                 console.log(`Moved to next segment: ${this.currentSegmentIdx}`);
//             }
//         }

//         return [currentSegment.phase, this.currentExercise, this.count, this.targetReps];
//     }

//     getIdealKeypoints(phase) {
//         const segment = this.segments[this.currentSegmentIdx];
//         if (segment.phase === phase) {
//             const middle = Math.floor((segment.start + segment.end) / 2);
//             return this.yoga.getIdealKeypoints(middle, middle + 1)[0] || [];
//         }
//         return [];
//     }

//     getTransitionKeypoints(startIdx, endIdx) {
//         for (let i = startIdx; i < endIdx; i++) {
//             if (this.segments[i].type === 'transition') {
//                 return this.yoga.getIdealKeypoints(this.segments[i].start, this.segments[i].end);
//             }
//         }
//         return [];
//     }
// }

