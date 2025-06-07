
// controller/controller.js
// console.log('Loading controller.js');
// import { StartPhase, TransitionPhase, HoldingPhase, EndingPhase, RelaxationPhase } from './phase_handlers.js';

// import { normalizeKeypoints, detectFacing, checkKeypointVisibility, calculateDtwScore } from '../utils/utils.js';
// import { drawPoseSkeleton, printTextOnFrame, drawDtwScores, drawTransitionPath, drawGuidanceArrow } from '../utils/camera_utils.js';
// import { YogaDataExtractor } from './yoga.js';
// import { TransitionAnalyzer, integrateWithController } from './transition_analysis.js';
// // import RepLogger from '../utils/rep_logger.js'
// console.log('All controller dependencies imported');

// export class Controller {
//     constructor(exercisePlan) {
//         console.log('Constructing Controller with exercise plan:', exercisePlan);
//         this.lastValidPoseTime = performance.now();  // Milliseconds
//         this.inRelaxation = false;
//         this.relaxationEnteredTime = 0;
//         this.relaxationThreshold = 5;  // Seconds (converted to ms in checks)

//         // Frame and processing properties
//         this.frame = null;
//         this.results = null;
        
//         // Exercise plan properties
//         this.exercisePlan = exercisePlan;
//         this.currentExerciseIdx = 0;
//         this.exerciseNames = Object.keys(exercisePlan);
//         this.currentExercise = this.exerciseNames[this.currentExerciseIdx];
//         this.jsonPath = exercisePlan[this.currentExercise].json_path;
//         this.targetReps = exercisePlan[this.currentExercise].reps;
        
//         // Yoga data components
//         this.yoga = new YogaDataExtractor(this.jsonPath);
//         this.segments = this.yoga.segments();  // Initialize from YogaDataExtractor
//         this.currentSegmentIdx = 0;
        
//         // Phase handling
//         this.phaseHandlers = this._initializeHandlers();  // Initialize properly
        
//         // Rep tracking
//         this.count = 0;
//         this.startTime = performance.now();  // Milliseconds
//         this.currentRepStartTime = null;
        
//         // Pose data
//         this.landmarks = null;
//         this.normalized = null;
//         this.normalizedKeypoints = null;
//         this.hipPoint = 0;
//         this.transitionKeypoints = [];


//         this.lastValidHoldTime = 0;
//         this.phaseTimeouts = {
//             transition: 10000,  // 10 seconds
//             holdingAbandonment: 5000,  // 5 seconds
//             holdingDuration: 5000  
//         };
//         this.lostPoseWarned = false;
//         this.currentExpertKeypoints = null;
//         // Analysis tools
//         this.lastHoldingIdx = -1;
//         // this.replogger = new RepLogger();
//         // this.current_rep_start_time = null;
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
//         const handlers = {};
//         this.segments.forEach((segment, i) => {
//             const phase = segment.phase;
//             const phaseType = segment.type;
//             const uniqueKey = `${phase}_${i}`;
//             const startFacing = segment.facing; // Directly use segment's facing

//             if (phaseType === 'starting') {
//                 handlers[uniqueKey] = new StartPhase(this, startFacing);
//             } else if (phaseType === 'transition') {
//                 handlers[uniqueKey] = new TransitionPhase(this, startFacing); // Pass facing
//             } else if (phaseType === 'holding') {
//                 handlers[uniqueKey] = new HoldingPhase(this, segment.thresholds, startFacing); // Add facing
//             } else if (phaseType === 'ending') {
//                 handlers[uniqueKey] = new EndingPhase(this, startFacing);
//             }else if (phaseType === 'relaxation') {
//                 handlers[uniqueKey] = new RelaxationPhase(this, startFacing);
//             }

//             segment.handlerKey = uniqueKey;
//         });
//         return handlers;
//     }

//     startExerciseSequence() {
//         console.log(`Starting exercise sequence for ${this.currentExercise}`);
//     }
//     update_phase_handlers_frame(){
//         for (const handlerKey of Object.keys(this.phaseHandlers)) {
//             this.phaseHandlers[handlerKey].normalizedKeypoints = this.normalizedKeypoints;
//             this.phaseHandlers[handlerKey].hipPoint = this.hipPoint;
//         }
//     }
//     updateFrame(results) {
//         console.log('Updating frame with results:', results);
//         this.results = results;
//         if (!results || !results.poseLandmarks) {
//             console.warn('No pose landmarks detected');
//             this.landmarks = null;
//             this.normalizedKeypoints = null;
//             return; // Don't update lastValidPoseTime here!
//         }

//         // Only update time when valid pose detected
//         this.landmarks = results.poseLandmarks;
//         const [allVisible, missing] = checkKeypointVisibility(this.landmarks);
//         if (allVisible) {
//             console.log("Works till here");
            
//             this.update_phase_handlers_frame();
//             [this.normalizedKeypoints, this.hipPoint] = normalizeKeypoints(this.landmarks);
//             console.log('Normalized keypoints:', this.normalizedKeypoints);
//         } else {
//             this.normalizedKeypoints = null;
//             console.log(`Missing keypoints: ${missing.join(', ')}`);
//         }
//     }
//     shouldEnterRelaxation(currentTime) {
//         // Check for no valid pose

//         const currentSegment = this.segments[this.currentSegmentIdx];
//         if (['starting', 'ending'].includes(currentSegment?.type)) {
//             const targetFacing = currentSegment.facing || 'front';
            
//             console.log(`target facing is ${targetFacing}`);
//             const face = detectFacing(this.normalizedKeypoints);
//             console.log(`detected facing is ${face}`);
//             return face !== targetFacing;
//         }

//         if (!this.normalizedKeypoints) {
//             const elapsed = currentTime - this.lastValidPoseTime;
//             return elapsed > this.relaxationThreshold * 1000;
//         }
//         // Check transition timeout
//         if (currentSegment?.type === 'transition') {
//             const transitionTimeout = 10000; // 10 seconds
//             return (currentTime - this.startTime) > transitionTimeout;
//         }

//         return false;
//     }
    
//     handleRelaxationPhase(currentTime) {
//         /** Process relaxation phase */
//         console.log('We are here ')
        
//         if (!this.inRelaxation) {
//             this.inRelaxation = true;
//             this.relaxationEnteredTime = currentTime;
//             console.log("Entering relaxation phase");
//         }

//         const handler = new RelaxationPhase(this);
//         const { phase, completed } = handler.process(currentTime);

//         // Check exit conditions
//         if (completed || (currentTime - this.relaxationEnteredTime) > 30000) {
//             this.inRelaxation = false;
//             this.lastValidPoseTime = currentTime;
//             console.log("Exiting relaxation phase");
//         }
//     }

//     getRelaxationReturnValues() {
//         /** Return values when in relaxation phase */
//         return [
//             'relaxation',
//             this.currentExercise,
//             this.count,
//             this.targetReps
//         ];

//     }
//     processExercise(currentTime) {
//         // Early exits: need valid frame & results
//         if (!this.frame || !(this.frame instanceof CanvasRenderingContext2D) || !this.results) {
//             const seg = this.segments[this.currentSegmentIdx] || {};
//             return [
//                 seg.phase || 'waiting',
//                 this.currentExercise,
//                 this.count,
//                 this.targetReps
//             ];
//         }

//         // Ensure segments loaded
//         if (!this.segments || this.segments.length === 0) {
//             console.warn('Segments are not initialized');
//             return ['waiting', this.currentExercise, this.count, this.targetReps];
//         }

//         // Fetch current segment
//         const currentSegment = this.segments[this.currentSegmentIdx];
//         if (!currentSegment) {
//             // No segment → relaxation
//             this.handleRelaxationPhase(currentTime);
//             return this.getRelaxationReturnValues();
//         }

//         // Check if we should relax before processing
//         if (this.shouldEnterRelaxation(currentTime)) {
//             this.handleRelaxationPhase(currentTime);
//             return this.getRelaxationReturnValues();
//         }

//         // Process current phase
//         const handler = this.phaseHandlers[currentSegment.handlerKey];
//         const [phase, completed] = handler.process(currentTime);
//         console.log(`Processing segment: ${currentSegment.phase}, Completed: ${completed}`);

//         // Update normalized keypoints
//         if (this.landmarks) {
//             const [norm, hip] = normalizeKeypoints(this.landmarks);
//             this.normalizedKeypoints = norm;
//             this.hipPoint = hip;
//             console.log('Normalized keypoints:', norm);
//         }

//         // Draw path for transitions
//         if (currentSegment.type === 'transition' && this.normalizedKeypoints) {
//             this.transitionKeypoints.push(this.normalizedKeypoints);
//             drawTransitionPath(
//                 this.frame,
//                 this.transitionAnalyzer.getTransitionEndTarget(this.currentSegmentIdx),
//                 this.normalizedKeypoints,
//                 0.1
//             );
//         }

//         // Draw skeleton for non-transitions
//         if (this.landmarks && currentSegment.type !== 'transition') {
//             drawPoseSkeleton(this.frame, this.landmarks);
//         }

//         // Holding phase DTW scoring
//         if (currentSegment.type === 'holding' && this.normalizedKeypoints) {
//             const idealKeypoints = this.getIdealKeypoints(currentSegment.phase);
//             if (idealKeypoints.length) {
//                 const dtwResult = calculateDtwScore(idealKeypoints, this.normalizedKeypoints);
//                 if (dtwResult && typeof dtwResult.dtwDistance === 'number') {
//                     drawDtwScores(this.frame, {
//                         [currentSegment.phase]: {
//                             value: dtwResult.dtwDistance,
//                             threshold: currentSegment.thresholds[0]
//                         }
//                     });
//                     const userWrist = this.normalizedKeypoints[15];
//                     const idealWrist = idealKeypoints[15];
//                     drawGuidanceArrow(
//                         this.frame,
//                         userWrist,
//                         idealWrist,
//                         this.frame.canvas.width,
//                         this.frame.canvas.height,
//                         dtwResult.dtwDistance < currentSegment.thresholds[0]
//                     );
//                 }
//             }
//         }

//         // Transition to next segment or rep completion
//         if (completed) {
//             if (currentSegment.type === 'holding') {
//                 this.lastHoldingIdx = this.currentSegmentIdx;
//                 this.transitionKeypoints = [];
//             }
//             if (currentSegment.type === 'ending') {
//                 this.handleRepCompletion(currentTime);
//             } else if (this.currentSegmentIdx < this.segments.length - 1) {
//                 this.currentSegmentIdx++;
//                 this.startTime = currentTime;
//             }
//         }

//         return [phase, this.currentExercise, this.count, this.targetReps];
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



// controller/controller.js
console.log('Loading controller.js');
import { StartPhase, TransitionPhase, HoldingPhase, EndingPhase, RelaxationPhase } from './phase_handlers.js';

import { normalizeKeypoints, detectFacing, checkKeypointVisibility, calculateDtwScore, calculateEuclideanDistance } from '../utils/utils.js';
import { drawPoseSkeleton, printTextOnFrame, drawDtwScores, drawTransitionPath, drawGuidanceArrow } from '../utils/camera_utils.js';
import { YogaDataExtractor } from './yoga.js';
import { TransitionAnalyzer, integrateWithController } from './transition_analysis.js';
// import RepLogger from '../utils/rep_logger.js';
console.log('All controller dependencies imported');

export class Controller {
    constructor(exercisePlan) {
        console.log('Constructing Controller with exercise plan:', exercisePlan);
        this.lastValidPoseTime = performance.now();  // Milliseconds
        this.inRelaxation = false;
        this.relaxationEnteredTime = 0;
        this.relaxationThreshold = 5;  // Seconds (converted to ms in checks)
        this.relaxationSegmentIdx = 0;

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
        this.normalized = null;
        this.normalizedKeypoints = null;
        this.hipPoint = 0;
        this.transitionKeypoints = [];


        this.lastValidHoldTime = 0;
        this.phaseTimeouts = {
            transition: 10000,  // 10 seconds
            holdingAbandonment: 5000,  // 5 seconds
            holdingDuration: 5000  
        };
        this.lostPoseWarned = false;
        this.currentExpertKeypoints = null;
        // Analysis tools
        this.lastHoldingIdx = -1;
        // this.replogger = new RepLogger();
        // this.current_rep_start_time = null;
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
            const startFacing = segment.facing;

            if (phaseType === 'starting') {
                handlers[uniqueKey] = new StartPhase(this, startFacing);
            } else if (phaseType === 'transition') {
                handlers[uniqueKey] = new TransitionPhase(this , startFacing); // Pass facing
            } else if (phaseType === 'holding') {
                handlers[uniqueKey] = new HoldingPhase(this, segment.thresholds, startFacing); // Add facing
            } else if (phaseType === 'ending') {
                handlers[uniqueKey] = new EndingPhase(this, startFacing);
            }else if (phaseType === 'relaxation') {
                handlers[uniqueKey] = new RelaxationPhase(this, startFacing);
            }else if (phaseType === 'relaxation') handlers[uniqueKey] = new RelaxationPhase(this); 

            segment.handlerKey = uniqueKey;
        });
        return handlers;
    }

    startExerciseSequence() {
        console.log(`Starting exercise sequence for ${this.currentExercise}`);
    }
    update_phase_handlers_frame(){
        for (const handlerKey of Object.keys(this.phaseHandlers)) {
            this.phaseHandlers[handlerKey].normalizedKeypoints = this.normalizedKeypoints;
            this.phaseHandlers[handlerKey].hipPoint = this.hipPoint;
        }
    }

    updateFrame(results) {
        // Always stash the raw results
        this.results = results;

        // 1) No detections at all → nothing to do this frame
        if (!results) {
            return;
        }

        // 2) Landmarks missing or empty → warn once, clear state, then bail this frame
        if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
            if (!this.lostPoseWarned) {
                console.warn('No pose landmarks detected (first warning)');
                this.lostPoseWarned = true;
            }
            this.landmarks = null;
            this.normalizedKeypoints = null;
            // Update handlers so they know there are no keypoints
            this.update_phase_handlers_frame();
            return;
        }

        // 3) We’ve just regained detection → clear the warning
        if (this.lostPoseWarned) {
            console.log('Pose landmarks regained');
            this.lostPoseWarned = false;
        }

        // 4) Valid landmarks: normalize, update timers, and propagate to handlers
        this.landmarks = results.poseLandmarks;
        const [allVisible, missing] = checkKeypointVisibility(this.landmarks);

        if (allVisible) {
            // Full-body pose seen → update the “last seen” timer
            this.lastValidPoseTime = performance.now();

            // Normalize & store keypoints
            [this.normalizedKeypoints, this.hipPoint] = normalizeKeypoints(this.landmarks);
            this.update_phase_handlers_frame();
        } else {
            // Partial detection → let handlers decide, but keep lastValidPoseTime
            this.normalizedKeypoints = null;
            console.log(`Missing keypoints: ${missing.join(', ')}`);
        }

        // Always push the new normalizedKeypoints (or null) into your phase handlers
        this.update_phase_handlers_frame();
    }



    handleRepCompletion(currentTime) {
        this.count++;
        
        // Check if all reps completed
        if (this.count >= this.targetReps) {
            // Load next exercise
            if (this.currentExerciseIdx < this.exerciseNames.length - 1) {
                this.currentExerciseIdx++;
                this.resetForNewExercise();
                console.log(`Starting next exercise: ${this.currentExercise}`);
            }
        }
        
        // Reset for new rep
        this.currentSegmentIdx = 0;
        this.startTime = currentTime;
    }
    // controller.js - New method
    checkPhaseTimeouts(currentTime) {
        const currentSegment = this.segments[this.currentSegmentIdx];
        
        if (currentSegment.type === 'transition') {
            const elapsed = currentTime - this.startTime;
            if (elapsed > this.phaseTimeouts.transition) {
                console.log('Transition timeout triggered');
                this.currentSegmentIdx = 0; // Return to relaxation
                this.transitionKeypoints = [];
            }
        }
        
        if (currentSegment.type === 'holding') {
            if (currentTime - this.lastValidHoldTime > this.phaseTimeouts.holdingAbandonment) {
                console.log('Holding abandonment detected');
                this.currentSegmentIdx = 0; // Return to relaxation
            }
        }
    }
    enterRelaxation() {
        this.inRelaxation = true;
        this.currentSegmentIdx = this.relaxationSegmentIdx; // e.g., index 0
        this.startTime = performance.now();
    }

    // controller.js - Modified handleRepCompletion()
    handleRepCompletion(currentTime) {
        this.count++;
        
        if (this.count >= this.targetReps) {
            if (this.currentExerciseIdx < this.exerciseNames.length - 1) {
                this.currentExerciseIdx++;
                this.resetForNewExercise();
                printTextOnFrame(
                    this.frame,
                    `Next Exercise: ${this.currentExercise}`,
                    {x: 10, y: 30},
                    'cyan'
                );
            } else {
                printTextOnFrame(
                    this.frame,
                    'Workout Complete!',
                    {x: 10, y: 30},
                    'gold'
                );
            }
        }
        
        this.currentSegmentIdx = this.relaxationSegmentIdx;
        this.startTime = currentTime;
    }
    resetForNewExercise() {
        this.currentExercise = this.exerciseNames[this.currentExerciseIdx];
        this.jsonPath = this.exercisePlan[this.currentExercise].json_path;
        this.targetReps = this.exercisePlan[this.currentExercise].reps;
        this.yoga = new YogaDataExtractor(this.jsonPath);
        this.segments = this.yoga.segments();
        this.phaseHandlers = this._initializeHandlers();
        console.log(`Phase handlers initialized: ${this.phaseHandlers}`);

        this.count = 0;
    }
    shouldEnterRelaxation(currentTime) {
        const current = this.segments[this.currentSegmentIdx];
        const elapsed = currentTime - this.lastValidPoseTime;

        // If we haven’t seen a full-body pose in 5s → relax
        if (!this.landmarks && elapsed > this.relaxationThreshold*1000) {
            return true;
        }

        // If we’re in a start/ending phase, only exit when we *know* we’re facing wrong
        if (['starting','ending'].includes(current?.type)) {
        // only try to detect facing if you actually have a normalized keypoint array
            if (this.landmarks) {
                // const target = current.facing || 'front';
                const target = current.facing || 'front';
                console.log(`target facing declared here: ${target}`)
                console.log(`Normalized keypoints testing for facing=${this.normalizedKeypoints}`);
                const facing = detectFacing(this.landmarks);  // Raw landmarks, not normalized
                console.log('code works fine till here')
                if (facing != null && facing !== target) {
                console.log(`Detected facing=${facing}, expected=${target} → relaxing`);
                return true;
                }
            }
        }

        // Transition timeout
        if (current?.type === 'transition' &&
            currentTime - this.startTime > this.phaseTimeouts.transition) {
            return true;
        }

        return false;
    }

    handleRelaxationPhase(currentTime) {
        
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
            'relaxation',
            this.currentExercise,
            this.count,
            this.targetReps
        ];

    }
    // In controller.js - Modified processExercise()
    processExercise(currentTime) {
        // Handle relaxation phase entry
        if (!this.segments || this.segments.length === 0) {
            console.error('No segments loaded!');
            return ['error', '', 0, 0];
        }
        
        if (this.currentSegmentIdx >= this.segments.length) {
            console.warn('Segment index overflow - resetting');
            this.currentSegmentIdx = 0;
        }

        if (this.shouldEnterRelaxation(currentTime)) {
            this.handleRelaxationPhase(currentTime);
            return this.getRelaxationReturnValues();
        }

        // Get current phase handler
        const currentSegment = this.segments[this.currentSegmentIdx];
        const handler = this.phaseHandlers[currentSegment.handlerKey];
        
        // Process current phase
        const [phase, completed] = handler.process(currentTime);
        // Add after [phase, completed] = handler.process(currentTime):

        // Draw path for transitions
        if (currentSegment.type === 'transition' && this.normalizedKeypoints) {
            this.transitionKeypoints.push(this.normalizedKeypoints);
            drawTransitionPath(
                this.frame,
                this.transitionAnalyzer.getTransitionEndTarget(this.currentSegmentIdx),
                this.normalizedKeypoints,
                0.1
            );
        }

        // Draw skeleton for non-transitions
        if (this.landmarks && currentSegment.type !== 'transition') {
            drawPoseSkeleton(this.frame, this.landmarks);
        }

        // Holding phase visualization
        if (currentSegment.type === 'holding' && this.normalizedKeypoints) {
            const idealKeypoints = this.getIdealKeypoints(currentSegment.phase);
            if (idealKeypoints.length) {
                const dtwResult = calculateDtwScore(idealKeypoints, this.normalizedKeypoints);
                if (dtwResult?.dtwDistance !== undefined) {
                    drawDtwScores(this.frame, {
                        [currentSegment.phase]: {
                            value: dtwResult.dtwDistance,
                            threshold: currentSegment.thresholds[0]
                        }
                    });
                    // const userWrist = this.normalizedKeypoints[15];
                    // const idealWrist = idealKeypoints[15];
                    // drawGuidanceArrow(
                    //     this.frame,
                    //     userWrist,
                    //     idealWrist,
                    //     this.frame.canvas.width,
                    //     this.frame.canvas.height,
                    //     dtwResult.dtwDistance < currentSegment.thresholds[0]
                    // );
                    const hipNorm     = this.hipPoint;               // [x,y] in 0…1
                    const userRel     = this.normalizedKeypoints[15]; // [dx,dy] around hip
                    const idealRel    = idealKeypoints[15];                     // [dx,dy] around hip
                    const canvasW     = this.frame.canvas.width;
                    const canvasH     = this.frame.canvas.height;
                    const isSuccess   = (dtwResult.dtwDistance < currentSegment.thresholds[0]);

                    drawGuidanceArrow(
                        this.frame,
                        hipNorm,
                        userRel,
                        idealRel,
                        canvasW,
                        canvasH,
                        isSuccess
                    );

                }
            }
        }
        // Phase transition logic
        if (completed) {
            if (currentSegment.type === 'starting') {
                // Starting phase completed, move to transition
                this.currentSegmentIdx++;
                this.startTime = currentTime;
            } 
            else if (currentSegment.type === 'transition') {
                // Transition phase timeout handling
                if (currentTime - this.startTime > 10000) { // 10 second timeout
                    this.currentSegmentIdx = 0; // Back to relaxation
                    console.log('Transition timeout - returning to relaxation');
                } else {
                    this.currentSegmentIdx++; // Proceed to holding
                    this.startTime = currentTime;
                }
            }
            else if (currentSegment.type === 'holding') {
                // Start monitoring for abandonment
                const newIdx = this.currentSegmentIdx + 1;
                this.currentSegmentIdx = newIdx;
                this.startTime = currentTime;

                const nextSeg = this.segments[newIdx];
                if (nextSeg.type === 'holding') {
                this.phaseHandlers[nextSeg.handlerKey]._resetTimers();
                }
            }
            else if (currentSegment.type === 'ending') {
                // Rep completion logic
                this.handleRepCompletion(currentTime);
                this.currentSegmentIdx = this.relaxationSegmentIdx;
            }
        }

        // Check for holding phase abandonment
        if (currentSegment.type === 'holding' && 
            currentTime - this.lastValidHoldTime > 5000) {
            console.log('Holding phase abandoned - returning to relaxation');
            this.currentSegmentIdx = 0;
        }

        return [phase, this.currentExercise, this.count, this.targetReps];
    }

    getIdealKeypoints(phase) {
        const segment = this.segments[this.currentSegmentIdx];
        if (segment.phase === phase) {
            const middle = Math.floor((segment.start + segment.end) / 2);
            return this.yoga.getIdealKeypoints(middle, middle + 1)[0] || [];
        }
        return [];
    }
    getNextIdealKeypoints(phase, segmentidx){
        const segment = this.segments[segmentidx];
        const middle = Math.floor((segment.start + segment.end) / 2);
        return this.yoga.getIdealKeypoints(middle, middle + 1)[0] || [];
        
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