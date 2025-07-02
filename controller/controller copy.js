// Controller.js
console.log('Loading controller.js');
// Importing important requirements
import { StartPhase, TransitionPhase, HoldingPhase, EndingPhase, RelaxationPhase } from './phase_handlers.js';
import { normalizeKeypoints, detectFacing, checkKeypointVisibility, calculateDtwScore, calculateEuclideanDistance } from '../utils/utils.js';
import { drawPoseSkeleton, printTextOnFrame, drawDtwScores, drawTransitionPath, drawGuidanceArrow } from '../utils/camera_utils.js';
import { YogaDataExtractor } from './yoga.js';
import { TransitionAnalyzer, integrateWithController } from './transition_analysis.js';
console.log('All controller dependencies imported');

export class Controller {
    /**
     * Controller class constructor.
     * Sets up all internal state and loads exercise data for the given plan.
    */
    constructor(exercisePlan) {
        // Log the incoming exercise plan for debugging
        console.log('Constructing Controller with exercise plan:', exercisePlan);

        // Track the timestamp of the last valid pose detection
        this.lastValidPoseTime = performance.now();

        // Relaxation (rest) state management
        this.inRelaxation = false;           // Are we currently in a relaxation phase?
        this.relaxationEnteredTime = 0;      // When did we enter relaxation?
        this.relaxationThreshold = 5;        // Seconds required to count as a relaxation hold
        this.relaxationSegmentIdx = 0;       // Index of the relaxation segment in the plan

        // Canvas/frame references (injected each frame)
        this.frame = null;                   
        this.results = null;                 // Latest MediaPipe results

        // Store the full exercise plan and initialize pointers
        this.exercisePlan = exercisePlan;    
        this.currentExerciseIdx = 0;         // Index into the list of exercises
        this.exerciseNames = Object.keys(exercisePlan);  // e.g. ['Anuvittasana']
        this.currentExercise = this.exerciseNames[this.currentExerciseIdx];
        this.jsonPath = exercisePlan[this.currentExercise].json_path;  // Path to keypoint JSON
        this.targetReps = exercisePlan[this.currentExercise].reps;     // Repetitions to perform

        // Load exercise data and segment definitions
        this.yoga = new YogaDataExtractor(this.jsonPath);
        this.segments = this.yoga.segments();   // Array of segments (poses/phases)
        this.currentSegmentIdx = 0;             // Which segment we're currently evaluating

        // Handlers for each phase (transition, hold, relaxation, etc.)
        this.phaseHandlers = this._initializeHandlers();

        // Rep counting and timing
        this.count = 0;                         // Completed reps for current exercise
        this.startTime = performance.now();     // When the exercise sequence began
        this.currentRepStartTime = null;        // When the current rep started

        // Pose landmarks and normalization buffers
        this.landmarks = null;
        this.normalized = null;
        this.normalizedKeypoints = null;
        this.hipPoint = 0;                      // Example: used to detect hip position
        this.transitionKeypoints = [];          // Keypoints tracked during transitions

        // Timeouts for each phase to avoid stalling
        this.lastValidHoldTime = 0;             // Last time a hold was detected
        this.phaseTimeouts = {
            transition: 10000,        // Max ms allowed for a transition phase
            holdingAbandonment: 5000, // Max ms to re-enter a hold before abandoning
            holdingDuration: 5000     // Required ms to count a valid hold
        };
        this.lostPoseWarned = false;            // Whether we've warned the user about losing the pose

        // Expert reference keypoints for feedback/comparison
        this.currentExpertKeypoints = null;
        this.lastHoldingIdx = -1;               // Last segment index where hold was detected

        // Analyzer to examine transitions between segments for correctness
        this.transitionAnalyzer = new TransitionAnalyzer(this.jsonPath, this.currentExercise);
    }


    /**
    * Asynchronously load exercise data, initialize segments, phase handlers, and integrate transition analysis.
    */
    async initialize() {
        // Inform that YogaDataExtractor loading has started
        console.log('Initializing YogaDataExtractor');

        // Ensure the JSON keypoint data is fetched and parsed
        await this.yoga.ensureLoaded();

        // Confirm that the data is ready
        console.log("Data loaded and exercise initialized");

        // Retrieve the sequence of segments (phases) from the loaded data
        this.segments = this.yoga.segments();
        console.log('Segments initialized:', this.segments);

        // If no segments were loaded, log an error and abort initialization
        if (this.segments.length === 0) {
            console.error('No segments available, exercise cannot start');
            return;
        }

        // Create a fresh set of handlers for each segment phase
        this.phaseHandlers = this._initializeHandlers();
        console.log('Phase handlers initialized:', Object.keys(this.phaseHandlers));

        // Wire up the transition analyzer so phases can access its feedback
        integrateWithController(this, this.transitionAnalyzer);
        console.log('Transition analyzer integrated');
    }

    /**
     * Build and return an object mapping each segment to its corresponding phase handler instance.
     * Each handler encapsulates logic for starting, transitioning, holding, ending, or relaxing phases.
     */
    _initializeHandlers() {
        const handlers = {};

        // Iterate over each segment definition loaded from the JSON
        this.segments.forEach((segment, i) => {
            // Extract identifying properties from the segment
            const phase = segment.phase;           // e.g. "LiftArms"
            const phaseType = segment.type;        // e.g. "starting", "transition", "holding", etc.
            const uniqueKey = `${phase}_${i}`;     // e.g. "LiftArms_0"
            const startFacing = segment.facing;    // expected user orientation

            // Choose and instantiate the correct handler class based on segment type
            if (phaseType === 'starting') {
                handlers[uniqueKey] = new StartPhase(this, startFacing);
            } else if (phaseType === 'transition') {
                handlers[uniqueKey] = new TransitionPhase(this, startFacing);
            } else if (phaseType === 'holding') {
                // HoldingPhase receives threshold parameters to determine hold duration
                handlers[uniqueKey] = new HoldingPhase(this, segment.thresholds, startFacing);
            } else if (phaseType === 'ending') {
                handlers[uniqueKey] = new EndingPhase(this, startFacing);
            } else if (phaseType === 'relaxation') {
                // RelaxationPhase handles rest periods between reps
                handlers[uniqueKey] = new RelaxationPhase(this, startFacing);
            }

            // Attach the handler key back to the segment for lookup during processing
            segment.handlerKey = uniqueKey;
        });

        return handlers;
    }


    /**
     * Begins the exercise sequence by logging the current exercise name.
     * Can be extended to reset timers, UI state, or trigger the first phase handler.
     */
    startExerciseSequence() {
        console.log(`Starting exercise sequence for ${this.currentExercise}`);
    }

    /**
     * Pushes the latest normalized keypoints and hip position into every phase handler.
     * Ensures each handler has the data it needs before processing.
     */
    update_phase_handlers_frame() {
        // Iterate over each registered phase handler
        for (const handlerKey of Object.keys(this.phaseHandlers)) {
            // Provide the handler with the normalized keypoints (x,y coordinates scaled to frame)
            this.phaseHandlers[handlerKey].normalizedKeypoints = this.normalizedKeypoints;
            // Provide the handler with the hip reference point for orientation or thresholding
            this.phaseHandlers[handlerKey].hipPoint = this.hipPoint;
        }
    }

    /**
     * Called each time MediaPipe Pose produces new results for the current frame.
     * Updates internal landmark buffers, handles lost/regained pose warnings,
     * normalizes keypoints for use by phase handlers, and pushes data to them.
     *
     * @param {PoseResults} results - The output from MediaPipe Pose for the current frame.
     */
    updateFrame(results) {
        this.results = results;

        // If there are no results, nothing to process
        if (!results) {
            return;
        }

        // If no landmarks detected, warn once and clear stored keypoints
        if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
            if (!this.lostPoseWarned) {
                console.warn('No pose landmarks detected (first warning)');
                this.lostPoseWarned = true;
            }
            this.landmarks = null;
            this.normalizedKeypoints = null;
            // Propagate cleared data to handlers
            this.update_phase_handlers_frame();
            return;
        }

        // If we had previously lost the pose and now have it back, log recovery
        if (this.lostPoseWarned) {
            console.log('Pose landmarks regained');
            this.lostPoseWarned = false;
        }

        // Store raw pose landmarks for reference or advanced analysis
        this.landmarks = results.poseLandmarks;

        // Check visibility of required keypoints (returns [allVisible, missingList])
        const [allVisible, missing] = checkKeypointVisibility(this.landmarks);

        if (allVisible) {
            // Mark the time of the last valid detection
            this.lastValidPoseTime = performance.now();

            // Normalize keypoints to a consistent coordinate space and compute hip reference
            [this.normalizedKeypoints, this.hipPoint] = normalizeKeypoints(this.landmarks);
            // Push the freshly normalized data into each phase handler
            this.update_phase_handlers_frame();
        } else {
            // If some keypoints are missing, clear normalized data and log which ones
            this.normalizedKeypoints = null;
            console.log(`Missing keypoints: ${missing.join(', ')}`);
            // Still update handlers so they know visibility failed
            this.update_phase_handlers_frame();
        }
        this.update_phase_handlers_frame();
    }


    /**
     * checkPhaseTimeouts
     * Enforces time limits on transition and holding phases to prevent stalling.
     *
     * @param {number} currentTime - The current timestamp in milliseconds.
     */
    checkPhaseTimeouts(currentTime) {
        // Get the active segment (phase) definition
        const currentSegment = this.segments[this.currentSegmentIdx];
        
        // If we're in a transition phase, ensure it doesn't exceed the maximum allowed time
        if (currentSegment.type === 'transition') {
            const elapsed = currentTime - this.startTime;  // Time since phase started
            if (elapsed > this.phaseTimeouts.transition) {
                console.log('Transition timeout triggered');
                // Reset back to the relaxation segment to let user rest and prepare
                this.currentSegmentIdx = 0;
                // Clear any stored keypoints for transition analysis
                this.transitionKeypoints = [];
            }
        }
        
        // If we're in a holding phase, ensure the user hasn't abandoned the hold
        if (currentSegment.type === 'holding') {
            // If too much time has passed since the last valid hold detection
            if (currentTime - this.lastValidHoldTime > this.phaseTimeouts.holdingAbandonment) {
                console.log('Holding abandonment detected');
                // Return to relaxation segment to allow user to reset
                this.currentSegmentIdx = 0;
            }
        }
    }

    /**
     * enterRelaxation
     * Switches the controller into a relaxation (rest) phase.
     * Resets timing and segment index to the predefined relaxation segment.
     */
    enterRelaxation() {
        this.inRelaxation = true;                       // Mark that we're now resting
        this.currentSegmentIdx = this.relaxationSegmentIdx;  // Jump to the relaxation segment
        this.startTime = performance.now();              // Reset the phase timer
    }


    /**
     * Called when a single repetition (rep) of the current exercise is completed.
     * Increments rep count, handles transition to next exercise or workout completion,
     * and then moves into the relaxation (rest) phase.
     *
     * @param {number} currentTime - Timestamp in milliseconds when rep completed
     */
    handleRepCompletion(currentTime) {
        // Increment the completed rep counter
        this.count++;

        // If we've reached or exceeded target reps for this exercise...
        if (this.count >= this.targetReps) {
            // ...and there is another exercise in the plan
            if (this.currentExerciseIdx < this.exerciseNames.length - 1) {
                // Advance to the next exercise
                this.currentExerciseIdx++;
                this.resetForNewExercise();

                // Inform the user via overlay text
                printTextOnFrame(
                    this.frame,
                    `Next Exercise: ${this.currentExercise}`,
                    { x: 10, y: 30 },
                    'cyan'
                );
            } else {
                // No more exercises: workout is complete
                printTextOnFrame(
                    this.frame,
                    'Workout Complete!',
                    { x: 10, y: 30 },
                    'gold'
                );
            }
        }

        // After finishing (or partially finishing) a rep, enter relaxation/rest
        this.currentSegmentIdx = this.relaxationSegmentIdx;
        this.startTime = currentTime; // Reset phase timer for relaxation
    }

    /**
     * Resets controller state to start tracking a new exercise.
     * Reloads JSON data, segments, handlers, and resets rep counter.
     */
    resetForNewExercise() {
        // Update the current exercise identifiers & targets
        this.currentExercise = this.exerciseNames[this.currentExerciseIdx];
        this.jsonPath = this.exercisePlan[this.currentExercise].json_path;
        this.targetReps = this.exercisePlan[this.currentExercise].reps;

        // Reload exercise data and segment definitions
        this.yoga = new YogaDataExtractor(this.jsonPath);
        this.segments = this.yoga.segments();

        // Rebuild phase handlers for the new exercise
        this.phaseHandlers = this._initializeHandlers();
        console.log(`Phase handlers initialized: ${Object.keys(this.phaseHandlers)}`);

        // Reset rep count for the new exercise
        this.count = 0;
    }

    /**
     * Determines whether the controller should switch into a relaxation (rest) phase,
     * based on lost pose, incorrect facing, or timeouts in transition phases.
     *
     * @param {number} currentTime - Current timestamp in milliseconds
     * @returns {boolean} - True if relaxation should be entered
     */
    shouldEnterRelaxation(currentTime) {
        const current = this.segments[this.currentSegmentIdx];
        const elapsedSinceValidPose = currentTime - this.lastValidPoseTime;

        // 1) No full-body pose detected for longer than relaxation threshold → rest
        if (!this.landmarks && elapsedSinceValidPose > this.relaxationThreshold * 1000) {
            return true;
        }

        // 2) In a starting or ending phase: if user is facing wrong direction → rest
        if (['starting', 'ending'].includes(current?.type)) {
            if (this.landmarks) {
                const target = current.facing || 'front';
                console.log(`target facing declared here: ${target}`);
                console.log(`Normalized keypoints testing for facing=${this.normalizedKeypoints}`);
                const facing = detectFacing(this.landmarks);  // Determine actual facing
                console.log('code works fine till here');
                if (facing != null && facing !== target) {
                    console.log(`Detected facing=${facing}, expected=${target} → relaxing`);
                    return true;
                }
            }
        }

        // 3) Transition phase timeout → rest
        if (
            current?.type === 'transition' &&
            currentTime - this.startTime > this.phaseTimeouts.transition
        ) {
            return true;
        }

        // Otherwise, do not enter relaxation
        return false;
    }


    /**
     * Handles the relaxation (rest) phase logic.
     * When called, enters relaxation if not already in it, processes the relaxation phase,
     * and checks exit conditions (either completion or timeout).
     *
     * @param {number} currentTime - Current timestamp in milliseconds
     */
    handleRelaxationPhase(currentTime) {
        // If we haven’t yet flagged that we're in relaxation, initialize it
        if (!this.inRelaxation) {
            this.inRelaxation = true;              // Mark relaxation state
            this.relaxationEnteredTime = currentTime; // Record entry time
            console.log("Entering relaxation phase");
        }

        // Create a fresh RelaxationPhase handler for processing this phase
        const handler = new RelaxationPhase(this);
        // Run the relaxation phase logic (e.g., check if user has returned to neutral pose)
        const { phase, completed } = handler.process(currentTime);

        // Exit the relaxation phase when either:
        //  • the handler reports completion (e.g., user is ready to resume), or
        //  • a hard timeout of 30 seconds has elapsed
        if (completed || (currentTime - this.relaxationEnteredTime) > 30000) {
            this.inRelaxation = false;             // Clear relaxation flag
            this.lastValidPoseTime = currentTime;  // Reset the last-valid-pose timer
            console.log("Exiting relaxation phase");
        }
    }

    /**
     * Provides the values to return from processExercise() when in a relaxation phase.
     *
     * @returns {[string, string, number, number]}
     *   • 'relaxation' – current phase
     *   • this.currentExercise – name of the exercise being rested from
     *   • this.count – how many reps completed so far
     *   • this.targetReps – total reps targeted
     */
    getRelaxationReturnValues() {
        return [
            'relaxation',            // Phase name for UI/text overlay
            this.currentExercise,    // Which exercise is paused
            this.count,              // Reps done so far
            this.targetReps          // Reps to go
        ];
    }

    // Note: The modified processExercise() method in controller.js should call
    // handleRelaxationPhase() and getRelaxationReturnValues() when shouldEnterRelaxation()
    // returns true, integrating these helpers into the main state machine.

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
                    
                    const hipNorm     = this.hipPoint;              
                    const userRel     = this.normalizedKeypoints[15]; 
                    const idealRel    = idealKeypoints[15];                   
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
                console.log('Moved to transition');
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
            else if (currentSegment.type === 'ending'){
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