
console.log('Loading phase_handlers.js');
// Import utility functions for facing detection, DTW scoring, distance calculation, and drawing overlays
import { detectFacing, calculateDtwScore, calculateEuclideanDistance } from '../utils/utils.js';
import { printTextOnFrame, drawDtwScores } from '../utils/camera_utils.js';
// Import a specific check for bend-back posture used in the starting phase
import { checkBendback } from './holding.js';
/**
 * BasePhase
 * Abstract class that all specific phase handlers extend.
 * Provides common properties: reference to the controller, default hold duration,
 * and placeholders for normalized keypoints and hip tracking.
 */
export class BasePhase {
    constructor(controller) {
        this.controller = controller;
        this.holdDuration = 2;
        this.normalizedKeypoints = null;
        this.hipPoint = 0;
    }
    /**
     * process
     * Each subclass must implement this method to handle its phase logic.
     * @param {number} currentTime - The timestamp (ms) for the current frame
     * @throws {Error} if not overridden
     */
    process(currentTime) {
        throw new Error('Not implemented');
    }
}


/**
 * StartPhase
 * Handles the initial "starting" segment where the user must assume the start pose
 * with the correct facing direction and hold it for the required duration.
 */
export class StartPhase extends BasePhase {
    /**
     * @param {Controller} controller - The main Controller instance
     * @param {string} targetFacing - The required orientation (e.g., 'front', 'side')
     */
    constructor(controller, targetFacing) {
        super(controller);
        console.log(`StartPhase initialized with target facing: ${targetFacing}`);
        this.targetFacing = targetFacing;
        this.start_time = null;
    }
    
    /**
     * process
     * Checks user’s facing direction, compares current keypoints to the expert start pose,
     * and enforces a hold duration. Draws feedback on the canvas.
     *
     * @param {number} currentTime - The timestamp (ms) for the current frame
     * @returns {[string, boolean]} 
     *   • phase name (string)
     *   • completed flag (true once holdDuration is reached in correct pose)
     */
    process(currentTime) {
        console.log('Processing StartPhase');
        // 1) Detect current facing, defaulting to 'random' if no landmarks
        const detectedFacing = this.controller.landmarks ? detectFacing(this.controller.landmarks) : 'random';
        console.log(`StartPhase - Detected Facing: ${detectedFacing}, Target Facing: ${this.targetFacing}`);
        // 2) Identify the phase name from the current segment metadata
        const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
        // 3) Load expert keypoints for comparison (though expertKeypoints is unused here)
        const expertKeypoints = this.controller.getIdealKeypoints(this.targetFacing);
        // 4) Load the ideal starting keypoints for DTW comparison
        const idealStartingKeypoints = this.controller.getNextIdealKeypoints('starting', 0);
        // 5) Grab the thresholds configured for the starting segment
        this.thresholds = this.controller.segments[0].thresholds;
        console.log(`Thresholds of starting phase are ${this.thresholds}`);
        // 6) Use checkBendback to validate posture; returns updated context and a success flag
        const [ctx, success] = checkBendback(
            this.controller.frame,
            idealStartingKeypoints,
            this.controller.normalizedKeypoints,
            currentTime,
            this.thresholds
        );
        // Update the controller’s canvas context with any drawings from checkBendback
        this.controller.frame = ctx;
        console.log(`starting Frame Success: ${success}`);
        // 7) Calculate Euclidean distance between user and expert keypoints (not directly used)
        const distance = calculateEuclideanDistance(
            this.controller.normalizedKeypoints,
            expertKeypoints
        ); 
        // 8) If posture is correct AND facing matches target, show positive feedback and handle hold timing
        if ( success && (detectedFacing === this.targetFacing)) {
        // if ((detectedFacing === this.targetFacing)) {
            printTextOnFrame(this.controller.frame, `Starting pose (${this.targetFacing}) detected`, { x: 10, y: 60 }, 'green');
            // Record the time when correct pose was first seen
            if(this.start_time == null){
                this.start_time = currentTime;
            }
            else{
                // If pose has been held long enough, mark phase as completed
                
                if ( currentTime - this.start_time >= this.holdDuration) {
                    console.log('Start phase completed');
                    return [phase, true];
                }
            }
            
        } else {
            // 9) Otherwise, prompt user to face the correct direction
            
            printTextOnFrame(this.controller.frame, `Face ${this.targetFacing} to start`, { x: 10, y: 60 }, 'red');
        }
        // 10) If hold duration not yet met, indicate phase is still in progress
        
        return [phase, false];
    }
}



// In phase_handlers.js - Modified TransitionPhase
/**
 * TransitionPhase
 * Handles the “transition” segment of an exercise, giving the user a countdown
 * and checking their movement against the next phase’s ideal pose.
 */
export class TransitionPhase extends BasePhase {
    /**
     * @param {Controller} controller - The main Controller instance
     * @param {string} startFacing - The initial facing direction (unused here, but available)
     */
    constructor(controller , startFacing) {
        super(controller);
        // Maximum allowed time (seconds) to complete this transition
        this.transitionTimeout = 15; 
        // Expected facing direction when starting the transition (not enforced here)
        this.startFacing = startFacing;
        // this.thresholds = thresholds;
        // this.thresholds = (thresholds ? [...thresholds] : [9.5, 4, 3]).map(t => t * 1.5);
        this.thresholds = null;
        console.log(`Transition thresholds: ${this.thresholds}`);
    }
    /**
     * process
     * Called each frame during a transition. Draws a countdown timer,
     * retrieves the next phase’s ideal keypoints, and runs a posture check.
     *
     * @param {number} currentTime - Current timestamp (ms)
     * @returns {[string, boolean]}
     *   • current phase name
     *   • success flag indicating whether transition posture is met
     */
    process(currentTime) {
        const elapsedMs = currentTime - this.controller.startTime;
        const elapsedSec = elapsedMs / 1000;
        // Time remaining in ms before timeout
        const timeLeft = this.transitionTimeout - elapsedMs;
        // Overlay the countdown timer on the video frame
        printTextOnFrame(
            this.controller.frame,
            `Transition: ${(timeLeft).toFixed(1)}s remaining`,
            { x: 10, y: 60 },
            'yellow'
        );
        // Get NEXT phase's ideal keypoints (if valid index)
        const nextSegmentIdx = this.controller.currentSegmentIdx + 1;
        console.log(`next segment index is: ${nextSegmentIdx}`);
        const phase = this.controller.segments[nextSegmentIdx].phase; 
        // Pull thresholds from the next segment’s configuration
        this.thresholds = this.controller.segments[nextSegmentIdx].thresholds;
        console.log(`Transition thresholds: ${this.thresholds}`);
        console.log(`next phase is: ${nextSegmentIdx}`);
        // Fetch the ideal keypoints for the next phase’s midpoint
        const idealKeypoints = this.controller.getNextIdealKeypoints(phase, nextSegmentIdx);
        
        console.log(`Here are the Keypoints ${idealKeypoints}`);
        
        console.log(`Here are the Keypoints size ${idealKeypoints.length}`);
        console.log(`Normalised Keypoints Transition ${this.controller.normalizedKeypoints}`);
        // Run a bend-back/posture check against the next phase’s ideal pose
        // The checkBendback function returns an updated canvas context and success boolean
        const [ctx, success] = checkBendback(
            this.controller.frame,
            idealKeypoints,
            this.controller.normalizedKeypoints,
            this.controller.hipPoint,
            this.thresholds
        );
        // Update the controller’s frame context with any helper drawings
        this.controller.frame = ctx;
        console.log(`Success: ${success}`);
        // If the transition time has fully elapsed, reset to the relaxation segment
        if((elapsedMs >= this.transitionTimeout)){
            this.controller.currentSegmentIdx = 0;
        }
        // Return the current segment’s phase name and whether the user met the posture
        return [
            this.controller.segments[this.controller.currentSegmentIdx].phase,
            success];
    }
}

/**
 * HoldingPhase
 * Manages the “holding” segment where the user must maintain a specific pose.
 * Provides feedback via DTW scores and guidance arrows, and enforces hold duration.
 */

export class HoldingPhase extends BasePhase {
    /**
     * @param {Controller} controller - Main Controller instance
     * @param {number[]} thresholds - Array of threshold values for DTW and posture checks
     * @param {string} startFacing - Expected facing direction (unused here)
     */
    constructor(controller, thresholds, startFacing) {
        // Reset all timers and state for a fresh hold
        super(controller);
        this._resetTimers();
        this.startFacing = startFacing;
        console.log('HoldingPhase initialized with thresholds:', thresholds);
        this.thresholds = thresholds;
        console.log(`Thresholds are: ${thresholds}`)
        // Track when the user first achieved a successful hold
        this.holdStartTime = null;
        this.successDuration = 0;
        this.minHoldDuration = 0;
        this.completedHold = false;
        this.exitThresholdMultiplier = 1.1;
        this.leavePoseTime = null;     
    }
    /**
     * Reset timers and state between holds.
     * Called when a hold completes to allow re-entry logic.
     */
    _resetTimers() {
        this.holdStartTime   = null;
        this.successDuration = 0;
        this.completedHold   = false;
        this.leavePoseTime   = null;
    }
    
    /**
     * process
     * Called each frame during a holding segment. Checks posture, computes DTW
     * distance, draws guidance, and determines when the hold is completed or abandoned.
     *
     * @param {number} currentTime - Current timestamp (ms)
     * @returns {[string, boolean]}
     *   • current phase name
     *   • completed flag indicating whether the hold phase is done
     */
    
    process(currentTime) {
        console.log("controller"+this.controller.normalizedKeypoints) ;
        console.log('Processing HoldingPhase');
        // 1) Determine phase name and ideal keypoints
        const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
        const idealKeypoints = this.controller.getIdealKeypoints(phase);
        console.log('Ideal keypoints for holding phase from phase handler:', idealKeypoints);
        console.log(`Normalised keypoints in Holding ${this.controller.normalizedKeypoints}`);

        // 2) If there was a previous transition, compute and display DTW on it
        if (this.controller.lastHoldingIdx !== -1 && 
            this.controller.currentSegmentIdx > this.controller.lastHoldingIdx && 
            this.controller.transitionKeypoints.length) {
            // Gather ideal vs. actual transition keypoints
            const idealTransKeypoints = this.controller.getTransitionKeypoints(this.controller.lastHoldingIdx, this.controller.currentSegmentIdx);
            if (idealTransKeypoints.length && this.controller.transitionKeypoints.length) {
                // Compare up to the shorter length
                const minLen = Math.min(this.controller.transitionKeypoints.length, idealTransKeypoints.length);
                const userTrans = this.controller.transitionKeypoints.slice(0, minLen).flat();
                const idealTrans = idealTransKeypoints.slice(0, minLen).flat();
                const { dtwDistance } = calculateDtwScore(userTrans, idealTrans);
                const color = dtwDistance < 50 ? 'green' : 'red';
                // Overlay the transition DTW score
                printTextOnFrame(this.controller.frame, `Transition DTW: ${dtwDistance.toFixed(2)}`, { x: 10, y: 120 }, color);
            }
        }

        // 3) If normalized keypoints are available, run posture check
        if (this.controller.normalizedKeypoints) {
            // checkBendback returns updated context and success boolean
            const [ctx, success] = checkBendback(this.controller.frame, idealKeypoints, this.controller.normalizedKeypoints, this.controller.hipPoint, this.thresholds);
            console.log(`Success in holding frame ${success}`);
            this.controller.frame = ctx;
            // Compute overall DTW on the whole pose for guidance
            const { dtwDistance: dtwWhole } = calculateDtwScore(idealKeypoints, this.controller.normalizedKeypoints);
            const exitThreshold = this.thresholds[0] * this.exitThresholdMultiplier;
            // 4) Handle early abandonment: if user breaks pose before completion
            if (!success && !this.completedHold) {
            // user is out of pose before completing
            if (this.leavePoseTime === null) {
                this.leavePoseTime = currentTime;
            }
            const elapsedLeave = currentTime - this.leavePoseTime;
            if (elapsedLeave > this.controller.phaseTimeouts.holdingAbandonment) {
                // 10 s up → force relaxation
                this.controller.enterRelaxation();
                return [ 'holding', false ];
            }
            } else {
                // either success or already completedHold
                this.leavePoseTime = null;
            }
            // Draw DTW scores
            const scores = {
                [phase]: { value: dtwWhole, threshold: this.thresholds[0] }
            };
            drawDtwScores(this.controller.frame, scores);

            // Draw arrow from user wrist to ideal wrist position
            const width = this.controller.frame.canvas.width;
            const height = this.controller.frame.canvas.height;
            const userWrist = this.controller.landmarks[15]; 
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
                    
                    this._resetTimers();
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
        return[ this.controller.segments[this.controller.currentSegmentIdx].phase, false ];
    }
}
/**
 * EndingPhase
 * Manages the “ending” segment where the user must return to the end pose
 * and hold it, similar to StartPhase but signifying rep completion.
 */
export class EndingPhase extends BasePhase {
    /**
     * @param {Controller} controller - Main Controller instance
     * @param {string} targetFacing - Required orientation to finish the rep
     */
    constructor(controller, targetFacing) {
        super(controller);
        console.log(`EndingPhase initialized with target facing: ${targetFacing}`);
        this.targetFacing = targetFacing;
        this.thresholds = null;
    }
    /**
     * process
     * Checks that the user has assumed the end pose with correct facing,
     * holds it for the required duration, and signals phase completion.
     *
     * @param {number} currentTime - Current timestamp (ms)
     * @returns {[string, boolean]}
     *   • phase name
     *   • completed flag indicating whether end hold duration is met
     */
    process(currentTime) {
        console.log('Processing EndingPhase');
        // 1) Detect current facing or default to 'random'
        const detectedFacing = this.controller.landmarks ? detectFacing(this.controller.landmarks) : 'random';
        console.log(`EndingPhase - Detected Facing: ${detectedFacing}, Target Facing: ${this.targetFacing}`);
        // 2) Identify phase name and load ideal keypoints & thresholds
        const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
        const idealEndingKeypoints = this.controller.getNextIdealKeypoints('starting', 0);
        this.thresholds = this.controller.segments[0].thresholds;
        console.log(`Thresholds of ending phase are ${this.thresholds}`);
        // 3) Run bend-back/posture check on the end pose
        const [ctx, success] = checkBendback(
            this.controller.frame,
            idealEndingKeypoints,
            this.controller.normalizedKeypoints,
            this.controller.hipPoint,
            this.thresholds
        );
        this.controller.frame = ctx;
        console.log(`Ending Frame Success: ${success}`);
        // 4) If posture and facing are correct, prompt and hold
        if (success && (detectedFacing === this.targetFacing)) {
        // if ((detectedFacing === this.targetFacing)) {
            printTextOnFrame(this.controller.frame, 'Repetition completed', { x: 10, y: 60 }, 'green');
            if (currentTime - this.controller.startTime >= this.holdDuration) {
                console.log('Ending phase completed');
                return [phase, true];
            }
        } else {
            printTextOnFrame(this.controller.frame, `Face ${this.targetFacing} to end or Go to ending position to end`, { x: 10, y: 60 }, 'red');
        }
        return [phase, false];
    }
}


/**
 * RelaxationPhase
 * Handles the rest period between reps or exercises, displaying a calming prompt
 * and detecting when the user is ready to resume.
 */
export class RelaxationPhase extends BasePhase {
    /**
     * @param {Controller} controller - Main Controller instance
     */
    constructor(controller) {
        super(controller);
        this.currentFeedback   = "Relax and breathe";
    }
    /**
     * process
     * Clears any transition data, draws the relaxation prompt,
     * and returns completion status based on pose + facing check.
     *
     * @param {number} currentTime - Current timestamp (ms) — unused here
     * @returns {{ phase: string, completed: boolean }}
     *   • phase: 'relaxation'
     *   • completed: whether the user is ready to resume
     */
    process(currentTime) {
        // clear any transition data
        // 1) Clear stored transition traces and last holding index
        this.controller.transitionKeypoints = [];
        this.controller.lastHoldingIdx     = -1;

        // draw feedback
        printTextOnFrame(
        this.controller.frame,
        this.currentFeedback,
        { x: 10, y: 60 },
        'rgb(255, 165, 0)'
        );

        // only the shouldExitRelaxation() result matters here
        return {
        phase:     'relaxation',
        completed: this.shouldExitRelaxation()
    };
  }
/**
 * shouldExitRelaxation
 * Determines if the user is back in the starting pose and facing correctly,
 * indicating readiness to begin the next rep.
 *
 * @returns {boolean} True if distance and facing thresholds are met
 */
shouldExitRelaxation() {
    const startSegment = this.controller.segments.find(s => s.type === 'starting');
    if (!startSegment) return false;

    // get expert pose (you may need to pick the right frame index)
    const expertKeypoints = this.controller.getIdealKeypoints(startSegment.phase);
    const userKeypoints   = this.controller.normalizedKeypoints;
    const distance        = calculateEuclideanDistance(userKeypoints, expertKeypoints);

    // check facing + distance threshold
    const THRESHOLD       = 0.15;
    const userFacing      = this.controller.landmarks
                          ? detectFacing(this.controller.landmarks)
                          : null;

    return distance < THRESHOLD && userFacing === startSegment.facing;
  }
}