
// // controller/phase_handlers.js
// console.log('Loading phase_handlers.js');

// import { detectFacing, calculateDtwScore } from '../utils/utils.js';
// import { printTextOnFrame, drawDtwScores } from '../utils/camera_utils.js';
// import { checkBendback } from './holding.js';

// export class BasePhase {
//     constructor(controller) {
//         this.controller = controller;
//         this.holdDuration = 3;
//         this.normalizedKeypoints = null;
//         this.hipPoint = 0;
//     }

//     process(currentTime) {
//         throw new Error('Not implemented');
//     }
// }



// export class StartPhase extends BasePhase {
//     constructor(controller, targetFacing) {
//         super(controller);
//         console.log(`StartPhase initialized with target facing: ${targetFacing}`);
//         this.targetFacing = targetFacing;
//     }

//     process(currentTime) {
//         console.log('Processing StartPhase');
//         const detectedFacing = this.controller.landmarks ? detectFacing(this.controller.landmarks) : 'random';
//         console.log(`StartPhase - Detected Facing: ${detectedFacing}, Target Facing: ${this.targetFacing}`);
//         const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
//         if (detectedFacing === this.targetFacing) {
//             printTextOnFrame(this.controller.frame, `Starting pose (${this.targetFacing}) detected`, { x: 10, y: 60 }, 'green');
//             if (currentTime - this.controller.startTime >= this.holdDuration) {
//                 console.log('Start phase completed');
//                 return [phase, true];
//             }
//         } else {
//             printTextOnFrame(this.controller.frame, `Face ${this.targetFacing} to start`, { x: 10, y: 60 }, 'red');
//         }
//         return [phase, false];
//     }
// }

// export class TransitionPhase extends BasePhase {
//     process(currentTime) {
//         console.log('Processing TransitionPhase');
//         const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
//         printTextOnFrame(this.controller.frame, 'Transitioning...', { x: 10, y: 60 }, 'yellow');
//         if (currentTime - this.controller.startTime >= this.holdDuration){
//             console.log('Transition phase completed');
//             return [phase, true];
//         }
//         return [phase, false];
//     }
// }





// export class HoldingPhase extends BasePhase {
//     constructor(controller, thresholds) {
//         super(controller);
//         console.log('HoldingPhase initialized with thresholds:', thresholds);
//         this.thresholds = thresholds;
//         this.holdStartTime = null;
//         this.successDuration = 0;
//         this.minHoldDuration = 2;
//         this.completedHold = false;
//         this.exitThresholdMultiplier = 1.1;
//     }
    
    
    
//     process(currentTime) {
//         console.log("controller"+this.controller.normalizedKeypoints) ;
//         console.log('Processing HoldingPhase');
//         const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
//         const idealKeypoints = this.controller.getIdealKeypoints(phase);
//         console.log('Ideal keypoints for holding phase from phase handler:', idealKeypoints);


//         if (this.controller.lastHoldingIdx !== -1 && 
//             this.controller.currentSegmentIdx > this.controller.lastHoldingIdx && 
//             this.controller.transitionKeypoints.length) {
//             const idealTransKeypoints = this.controller.getTransitionKeypoints(this.controller.lastHoldingIdx, this.controller.currentSegmentIdx);
//             if (idealTransKeypoints.length && this.controller.transitionKeypoints.length) {
//                 const minLen = Math.min(this.controller.transitionKeypoints.length, idealTransKeypoints.length);
//                 const userTrans = this.controller.transitionKeypoints.slice(0, minLen).flat();
//                 const idealTrans = idealTransKeypoints.slice(0, minLen).flat();
//                 const { dtwDistance } = calculateDtwScore(userTrans, idealTrans);
//                 const color = dtwDistance < 50 ? 'green' : 'red';
//                 printTextOnFrame(this.controller.frame, `Transition DTW: ${dtwDistance.toFixed(2)}`, { x: 10, y: 120 }, color);
//             }
//         }

//         if (this.controller.normalizedKeypoints) {
//             const [ctx, success] = checkBendback(this.controller.frame, idealKeypoints, this.controller.normalizedKeypoints, currentTime, this.thresholds);
//             this.controller.frame = ctx;
//             const { dtwDistance: dtwWhole } = calculateDtwScore(idealKeypoints, this.controller.normalizedKeypoints);
//             const exitThreshold = this.thresholds[0] * this.exitThresholdMultiplier;

//             // Draw DTW scores
//             const scores = {
//                 [phase]: { value: dtwWhole, threshold: this.thresholds[0] }
//             };
//             drawDtwScores(this.controller.frame, scores);

//             // Draw arrow from user wrist to ideal wrist position
//             const width = this.controller.frame.canvas.width;
//             const height = this.controller.frame.canvas.height;
//             const userWrist = this.controller.normalizedKeypoints[15]; // LEFT_WRIST
//             const idealWrist = idealKeypoints[15];
//             const userWristPixel = [(userWrist[0] + 1) * width / 2, (userWrist[1] + 1) * height / 2];
//             const idealWristPixel = [(idealWrist[0] + 1) * width / 2, (idealWrist[1] + 1) * height / 2];
//             this.controller.frame.beginPath();
//             this.controller.frame.moveTo(userWristPixel[0], userWristPixel[1]);
//             this.controller.frame.lineTo(idealWristPixel[0], idealWristPixel[1]);
//             this.controller.frame.strokeStyle = success ? 'green' : 'red';
//             this.controller.frame.lineWidth = 3;
//             this.controller.frame.stroke();
//             // Draw arrowhead
//             const angle = Math.atan2(idealWristPixel[1] - userWristPixel[1], idealWristPixel[0] - userWristPixel[0]);
//             const arrowSize = 10;
//             this.controller.frame.beginPath();
//             this.controller.frame.moveTo(idealWristPixel[0], idealWristPixel[1]);
//             this.controller.frame.lineTo(
//                 idealWristPixel[0] - arrowSize * Math.cos(angle + Math.PI / 6),
//                 idealWristPixel[1] - arrowSize * Math.sin(angle + Math.PI / 6)
//             );
//             this.controller.frame.moveTo(idealWristPixel[0], idealWristPixel[1]);
//             this.controller.frame.lineTo(
//                 idealWristPixel[0] - arrowSize * Math.cos(angle - Math.PI / 6),
//                 idealWristPixel[1] - arrowSize * Math.sin(angle - Math.PI / 6)
//             );
//             this.controller.frame.stroke();
//             console.log(`Arrow drawn from (${userWristPixel[0]}, ${userWristPixel[1]}) to (${idealWristPixel[0]}, ${idealWristPixel[1]})`);

//             if (success) {
//                 if (!this.holdStartTime) this.holdStartTime = currentTime;
//                 this.successDuration = currentTime - this.holdStartTime;
//                 printTextOnFrame(this.controller.frame, `Holding ${phase} (${this.successDuration.toFixed(1)}s)`, { x: 10, y: 60 }, 'green');
//                 if (this.successDuration >= this.minHoldDuration && !this.completedHold) {
//                     this.completedHold = true;
//                     printTextOnFrame(this.controller.frame, 'Hold completed, stay or adjust to exit', { x: 10, y: 90 }, 'green');
//                 }
//             } else {
//                 if (this.completedHold && dtwWhole > exitThreshold) {
//                     const phaseName = phase.split('_')[1] || phase;
//                     printTextOnFrame(this.controller.frame, `${phaseName} completed, exiting hold (DTW: ${dtwWhole.toFixed(2)})`, { x: 10, y: 60 }, 'green');
//                     console.log('Holding phase completed');
//                     return [phase, true];
//                 }
//                 if (!this.completedHold) {
//                     this.holdStartTime = null;
//                     this.successDuration = 0;
//                     printTextOnFrame(this.controller.frame, 'Adjust pose to hold', { x: 10, y: 60 }, 'red');
//                 } else {
//                     printTextOnFrame(this.controller.frame, `Hold completed, stay or adjust to exit (DTW: ${dtwWhole.toFixed(2)})`, { x: 10, y: 60 }, 'green');
//                 }
//             }
//         } else {
//             printTextOnFrame(this.controller.frame, 'Adjust pose', { x: 10, y: 60 }, 'red');
//             this.holdStartTime = null;
//             this.successDuration = 0;
//             this.completedHold = false;
//         }
//         return [phase, false];
//     }
// }

// export class EndingPhase extends BasePhase {
//     constructor(controller, targetFacing) {
//         super(controller);
//         console.log(`EndingPhase initialized with target facing: ${targetFacing}`);
//         this.targetFacing = targetFacing;
//     }

//     process(currentTime) {
//         console.log('Processing EndingPhase');
//         const detectedFacing = this.controller.landmarks ? detectFacing(this.controller.landmarks) : 'random';
//         console.log(`EndingPhase - Detected Facing: ${detectedFacing}, Target Facing: ${this.targetFacing}`);
//         const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
//         if (detectedFacing === this.targetFacing) {
//             printTextOnFrame(this.controller.frame, 'Repetition completed', { x: 10, y: 60 }, 'green');
//             if (currentTime - this.controller.startTime >= this.holdDuration) {
//                 console.log('Ending phase completed');
//                 return [phase, true];
//             }
//         } else {
//             printTextOnFrame(this.controller.frame, `Face ${this.targetFacing} to end`, { x: 10, y: 60 }, 'red');
//         }
//         return [phase, false];
//     }
// }

// export class RelaxationPhase extends BasePhase {
//     constructor(controller) {
//         super(controller);
//         this.lastFaceDetection = 0;
//         this.faceCheckInterval = 2000;
//         this.currentFeedback = "Relax and breathe";
//     }

//     process(currentTime) {
//         const phase = "relaxation";
        
//         if(currentTime - this.lastFaceDetection >= this.faceCheckInterval) {
//             const detectedFacing = this.controller.landmarks ? 
//                 detectFacing(this.controller.landmarks) : 
//                 "unknown";
            
//             this.lastFaceDetection = currentTime;
            
//             this.currentFeedback = detectedFacing === "random" ?
//                 "Relaxation Phase: Neutral position detected" :
//                 "Relaxation Phase: Adjust to neutral position";
//         }

//         printTextOnFrame(
//             this.controller.frame,
//             this.currentFeedback,
//             {x: 10, y: 60},
//             'rgb(255, 165, 0)' 
//         );

//         return { 
//             phase,
//             completed: this.shouldExitRelaxation()
//         };
//     }

//     shouldExitRelaxation() {
//         const currentSegment = this.controller.segments[this.controller.currentSegmentIdx];
    
//         if (currentSegment?.type === 'starting') {
//             const targetFacing = currentSegment.facing || 'front'; 
//             const detectedFacing = this.controller.landmarks ? 
//                 detectFacing(this.controller.landmarks) : 
//                 null;
            
//             return detectedFacing === targetFacing;
//         }
        
//         return false;
//     }
// }



// controller/phase_handlers.js

// this one makes arrow in transition phase
// export class TransitionPhase extends BasePhase {
//     // ... existing constructor ...

//     process(currentTime) {
//         const elapsedMs = currentTime - this.controller.startTime;
//         const elapsedSec = elapsedMs / 1000;
//         const timeLeft = this.transitionTimeout - elapsedSec;
//         printTextOnFrame(
//             this.controller.frame,
//             `Transition: ${(timeLeft).toFixed(1)}s remaining`,
//             { x: 10, y: 60 },
//             'yellow'
//         );

//         const nextSegmentIdx = this.controller.currentSegmentIdx + 1;
//         if (nextSegmentIdx >= this.controller.segments.length) {
//             return [this.controller.segments[this.controller.currentSegmentIdx].phase, true];
//         }

//         const phase = this.controller.segments[nextSegmentIdx].phase;
//         const idealKeypoints = this.controller.getIdealKeypoints(phase);

//         // Visualize target pose keypoints
//         if (this.controller.normalizedKeypoints && idealKeypoints) {
//             const width = this.controller.frame.canvas.width;
//             const height = this.controller.frame.canvas.height;

//             // Draw arrow from user wrist to target wrist position
//             const userWrist = this.controller.normalizedKeypoints[15]; // LEFT_WRIST
//             const targetWrist = idealKeypoints[15];
//             const userPixel = [
//                 (userWrist[0] + 1) * width / 2,
//                 (userWrist[1] + 1) * height / 2
//             ];
//             const targetPixel = [
//                 (targetWrist[0] + 1) * width / 2,
//                 (targetWrist[1] + 1) * height / 2
//             ];

//             // Draw guidance arrow
//             this.controller.frame.beginPath();
//             this.controller.frame.moveTo(userPixel[0], userPixel[1]);
//             this.controller.frame.lineTo(targetPixel[0], targetPixel[1]);
//             this.controller.frame.strokeStyle = 'cyan';
//             this.controller.frame.lineWidth = 3;
//             this.controller.frame.stroke();

//             // Draw target wrist position marker
//             this.controller.frame.beginPath();
//             this.controller.frame.arc(targetPixel[0], targetPixel[1], 8, 0, 2 * Math.PI);
//             this.controller.frame.fillStyle = 'rgba(0,255,255,0.5)';
//             this.controller.frame.fill();
//         }

//         const [ctx, success] = checkBendback(
//             this.controller.frame,
//             idealKeypoints,
//             this.controller.normalizedKeypoints,
//             currentTime,
//             this.thresholds
//         );

//         return [
//             this.controller.segments[this.controller.currentSegmentIdx].phase,
//             elapsedSec >= this.transitionTimeout || success
//         ];
//     }
// }


// In phase_handlers.js - Modified TransitionPhase


// phase_handlers.js
// Defines base and specific phase handler classes for managing each segment of the exercise routine.

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
        this.controller = controller;      // Reference to the main Controller instance
        this.holdDuration = 2;             // Default seconds required to hold a pose
        this.normalizedKeypoints = null;   // To be populated each frame by controller
        this.hipPoint = 0;                 // Hip reference point for orientation guidance
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
        this.targetFacing = targetFacing; // Expected facing direction to begin
        this.start_time = null;           // Timestamp when the correct pose was first detected
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
        const detectedFacing = this.controller.landmarks
            ? detectFacing(this.controller.landmarks)
            : 'random';
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
            this.controller.hipPoint,
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
        if (success && (detectedFacing === this.targetFacing)) {
            printTextOnFrame(
                this.controller.frame,
                `Starting pose (${this.targetFacing}) detected`,
                { x: 10, y: 60 },
                'green'
            );

            // Record the time when correct pose was first seen
            if (this.start_time == null) {
                this.start_time = currentTime;

            } 
            
            else {
                console.log('We are inside else:');
                // If pose has been held long enough, mark phase as completed
                if (currentTime - this.start_time >= this.holdDuration) {
                    console.log('Start phase completed');
                    return [phase, true];
                }
            }

        } else {
            // 9) Otherwise, prompt user to face the correct direction
            printTextOnFrame(
                this.controller.frame,
                `Face ${this.targetFacing} to start`,
                { x: 10, y: 60 },
                'red'
            );
        }

        // 10) If hold duration not yet met, indicate phase is still in progress
        return [phase, false];
    }
}


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
    constructor(controller, startFacing) {
        super(controller);
        // Maximum allowed time (seconds) to complete this transition
        this.transitionTimeout = 15;
        // Expected facing direction when starting the transition (not enforced here)
        this.startFacing = startFacing;
        // Thresholds will be pulled from the next segment when processing
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
        // Calculate elapsed time in ms and seconds since transition began
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

        // Determine the index and phase name of the upcoming segment
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
        if (elapsedMs >= this.transitionTimeout) {
            this.controller.currentSegmentIdx = 0;
        }

        // Return the current segment’s phase name and whether the user met the posture
        return [
            this.controller.segments[this.controller.currentSegmentIdx].phase,
            success
        ];
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
        super(controller);
        // Reset all timers and state for a fresh hold
        this._resetTimers();
        this.startFacing = startFacing;
        console.log('HoldingPhase initialized with thresholds:', thresholds);
        this.thresholds = thresholds;          // Thresholds for DTW/posture deviation
        console.log(`Thresholds are: ${thresholds}`);
        // Track when the user first achieved a successful hold
        this.holdStartTime = null;
        this.successDuration = 0;              // How long the hold has been successful
        this.minHoldDuration = 0;              // Minimum required duration (set elsewhere)
        this.completedHold = false;            // Whether the hold was completed
        this.exitThresholdMultiplier = 1.1;    // Allow slight overshoot to exit the hold
        this.leavePoseTime = null;             // Timestamp when user left the pose
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
        console.log("controller" + this.controller.normalizedKeypoints);
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
            const idealTransKeypoints = this.controller.getTransitionKeypoints(
                this.controller.lastHoldingIdx,
                this.controller.currentSegmentIdx
            );
            if (idealTransKeypoints.length && this.controller.transitionKeypoints.length) {
                // Compare up to the shorter length
                const minLen = Math.min(
                    this.controller.transitionKeypoints.length,
                    idealTransKeypoints.length
                );
                const userTrans = this.controller.transitionKeypoints.slice(0, minLen).flat();
                const idealTrans = idealTransKeypoints.slice(0, minLen).flat();
                const { dtwDistance } = calculateDtwScore(userTrans, idealTrans);
                const color = dtwDistance < 50 ? 'green' : 'red';
                // Overlay the transition DTW score
                printTextOnFrame(
                    this.controller.frame,
                    `Transition DTW: ${dtwDistance.toFixed(2)}`,
                    { x: 10, y: 120 },
                    color
                );
            }
        }

        // 3) If normalized keypoints are available, run posture check
        if (this.controller.normalizedKeypoints) {
            // checkBendback returns updated context and success boolean
            const [ctx, success] = checkBendback(
                this.controller.frame,
                idealKeypoints,
                this.controller.normalizedKeypoints,
                this.controller.hipPoint,
                this.thresholds
            );
            console.log(`Success in holding frame ${success}`);
            this.controller.frame = ctx;

            // Compute overall DTW on the whole pose for guidance
            const { dtwDistance: dtwWhole } = calculateDtwScore(
                idealKeypoints,
                this.controller.normalizedKeypoints
            );
            const exitThreshold = this.thresholds[0] * this.exitThresholdMultiplier;

            // 4) Handle early abandonment: if user breaks pose before completion
            if (!success && !this.completedHold) {
                if (this.leavePoseTime === null) {
                    this.leavePoseTime = currentTime;  // mark when they left the pose
                }
                const elapsedLeave = currentTime - this.leavePoseTime;
                if (elapsedLeave > this.controller.phaseTimeouts.holdingAbandonment) {
                    // Force relaxation after abandonment timeout
                    this.controller.enterRelaxation();
                    return ['holding', false];
                }
            } else {
                // If success or already completed, reset leave timer
                this.leavePoseTime = null;
            }

            // 5) Draw DTW score for the current hold
            const scores = {
                [phase]: { value: dtwWhole, threshold: this.thresholds[0] }
            };
            drawDtwScores(this.controller.frame, scores);

            // 6) Draw guidance arrow from user’s wrist to ideal wrist position
            const width = this.controller.frame.canvas.width;
            const height = this.controller.frame.canvas.height;
            const userWrist = this.controller.landmarks[15];  // raw landmark coords
            const idealWrist = idealKeypoints[15];
            const userWristPixel = [
                (userWrist[0] + 1) * width / 2,
                (userWrist[1] + 1) * height / 2
            ];
            const idealWristPixel = [
                (idealWrist[0] + 1) * width / 2,
                (idealWrist[1] + 1) * height / 2
            ];

            // Draw line
            this.controller.frame.beginPath();
            this.controller.frame.moveTo(...userWristPixel);
            this.controller.frame.lineTo(...idealWristPixel);
            this.controller.frame.strokeStyle = success ? 'green' : 'red';
            this.controller.frame.lineWidth = 3;
            this.controller.frame.stroke();

            // Draw arrowhead
            const angle = Math.atan2(
                idealWristPixel[1] - userWristPixel[1],
                idealWristPixel[0] - userWristPixel[0]
            );
            const arrowSize = 10;
            this.controller.frame.beginPath();
            this.controller.frame.moveTo(...idealWristPixel);
            this.controller.frame.lineTo(
                idealWristPixel[0] - arrowSize * Math.cos(angle + Math.PI / 6),
                idealWristPixel[1] - arrowSize * Math.sin(angle + Math.PI / 6)
            );
            this.controller.frame.moveTo(...idealWristPixel);
            this.controller.frame.lineTo(
                idealWristPixel[0] - arrowSize * Math.cos(angle - Math.PI / 6),
                idealWristPixel[1] - arrowSize * Math.sin(angle - Math.PI / 6)
            );
            this.controller.frame.stroke();
            console.log(
                `Arrow drawn from (${userWristPixel[0]}, ${userWristPixel[1]}) to ` +
                `(${idealWristPixel[0]}, ${idealWristPixel[1]})`
            );

            // 7) If posture is correct, update hold timing and display hold duration
            if (success) {
                if (!this.holdStartTime) {
                    this.holdStartTime = currentTime;  // start the hold timer
                }
                this.successDuration = currentTime - this.holdStartTime;
                printTextOnFrame(
                    this.controller.frame,
                    `Holding ${phase} (${(this.successDuration/1000).toFixed(1)}s)`,
                    { x: 10, y: 60 },
                    'green'
                );
                // Once minimum hold duration met, mark as completedHold
                if (this.successDuration >= this.minHoldDuration && !this.completedHold) {
                    this.completedHold = true;
                    printTextOnFrame(
                        this.controller.frame,
                        'Hold completed, stay or adjust to exit',
                        { x: 10, y: 90 },
                        'green'
                    );
                }
            } else {
                // 8) If user has already completed the hold but now exceeded exit threshold
                if (this.completedHold && dtwWhole > exitThreshold) {
                    const phaseName = phase.split('_')[1] || phase;
                    printTextOnFrame(
                        this.controller.frame,
                        `${phaseName} completed, exiting hold (DTW: ${dtwWhole.toFixed(2)})`,
                        { x: 10, y: 60 },
                        'green'
                    );
                    console.log('Holding phase completed');
                    this._resetTimers();
                    return [phase, true];  // signal phase completion
                }
                // 9) If still inside hold but adjustments needed
                if (!this.completedHold) {
                    this.holdStartTime = null;
                    this.successDuration = 0;
                    printTextOnFrame(
                        this.controller.frame,
                        'Adjust pose to hold',
                        { x: 10, y: 60 },
                        'red'
                    );
                } else {
                    // CompletedHold but within exit threshold
                    printTextOnFrame(
                        this.controller.frame,
                        `Hold completed, stay or adjust to exit (DTW: ${dtwWhole.toFixed(2)})`,
                        { x: 10, y: 60 },
                        'green'
                    );
                }
            }
        } else {
            // 10) No normalized keypoints → prompt adjustment
            printTextOnFrame(
                this.controller.frame,
                'Adjust pose',
                { x: 10, y: 60 },
                'red'
            );
            // Reset hold state
            this.holdStartTime = null;
            this.successDuration = 0;
            this.completedHold = false;
        }

        // 11) By default, indicate holding is still in progress
        return [this.controller.segments[this.controller.currentSegmentIdx].phase, false];
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
        this.targetFacing = targetFacing;  // Expected facing direction at end
        this.thresholds = null;            // Will be loaded from segment data
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
        const detectedFacing = this.controller.landmarks
            ? detectFacing(this.controller.landmarks)
            : 'random';
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
        if (success && detectedFacing === this.targetFacing) {
            printTextOnFrame(
                this.controller.frame,
                'Repetition completed',
                { x: 10, y: 60 },
                'green'
            );
            
            // Hold duration check before marking completion
            if (currentTime - this.controller.startTime >= this.holdDuration * 1000) {
                console.log('Ending phase completed');
                return [phase, true];
            }
        } else {
            // 5) Otherwise, instruct user to face correctly or adopt end pose
            printTextOnFrame(
                this.controller.frame,
                `Face ${this.targetFacing} to end or go to ending position to end`,
                { x: 10, y: 60 },
                'red'
            );
        }

        // 6) Continue waiting if conditions not yet met
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
        this.currentFeedback = "Relax and breathe";  // Message displayed during rest
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
        // 1) Clear stored transition traces and last holding index
        this.controller.transitionKeypoints = [];
        this.controller.lastHoldingIdx = -1;

        // 2) Draw the relaxation prompt on the canvas
        printTextOnFrame(
            this.controller.frame,
            this.currentFeedback,
            { x: 10, y: 60 },
            'rgb(255, 165, 0)'
        );

        // 3) Return the phase name and whether we should exit relaxation
        return {
            phase: 'relaxation',
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
        // 1) Find the starting segment definition
        const startSegment = this.controller.segments.find(s => s.type === 'starting');
        if (!startSegment) return false;

        // 2) Fetch expert and user keypoints for comparison
        const expertKeypoints = this.controller.getIdealKeypoints(startSegment.phase);
        const userKeypoints = this.controller.normalizedKeypoints;
        const distance = calculateEuclideanDistance(userKeypoints, expertKeypoints);

        // 3) Check that user is within distance threshold and facing matches
        const THRESHOLD = 0.15;
        const userFacing = this.controller.landmarks
            ? detectFacing(this.controller.landmarks)
            : null;

        return distance < THRESHOLD && userFacing === startSegment.facing;
    }
}