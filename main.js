/**
 * main.js
 * 
 * Entry point for the Yoga Tracker. 
 * - Initializes MediaPipe Pose.
 * - Loads exercise plan and Controller.
 * - Hooks into MediaPipe’s onResults to update and draw pose-based exercise logic.
 * - Starts an animation loop to feed video frames into MediaPipe.
 */

import { Controller } from './controller/controller.js';
import { printTextOnFrame } from './utils/camera_utils.js';

console.log('Starting main.js');

// Grab references to the <video> and <canvas> elements
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');


/**
 * initializePose()
 *
 * Creates and configures the MediaPipe Pose instance.
 * - locateFile: points to the CDN for all Pose assets.
 * - modelComplexity, minDetectionConfidence, minTrackingConfidence: set inference parameters.
 *
 * Returns a configured Pose object ready to accept frames.
 */


console.log('Initializing MediaPipe Pose');
const pose = new Pose({
    locateFile: (file) => {
        console.log(`Loading MediaPipe file: ${file}`);
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});
pose.setOptions({
    modelComplexity: 2,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});
// pose.onResults(onResults);

// const exercisePlan = {
//     "Anuvittasana": {
//         "json_path": "assets/Avuvittasana_female_video_keypoints.json",
//         "reps": 3
//     },
//     "Anuvittasana": {
//         "json_path": "assets/Avuvittasana_female_video_keypoints.json",
//         "reps": 2
//     }
// };

// console.log('Creating Controller instance');
// const controller = new Controller(exercisePlan);
// async function setupCamera() {
//     if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
//         console.error('MediaDevices API is not supported in this browser or context.');
//         alert('Please run this app over HTTP/HTTPS (e.g., via a local server) and ensure your browser supports the MediaDevices API.');
//         return;
//     }

//     try {
//         console.log('Requesting camera access');
//         const stream = await navigator.mediaDevices.getUserMedia({ video: true });
//         videoElement.srcObject = stream;
//         videoElement.onloadedmetadata = async () => {
//             console.log('Video metadata loaded, starting playback');
//             videoElement.play();
//             canvasElement.width = videoElement.videoWidth;
//             canvasElement.height = videoElement.videoHeight;
//             console.log('Initializing controller');
//             await controller.initialize();
//             if (controller.segments.length > 0) {
//                 console.log('Starting exercise sequence');
//                 controller.startExerciseSequence();
//                 requestAnimationFrame(processFrame);
//             } else {
//                 console.error('Failed to initialize segments, exercise cannot start');
//                 alert('Failed to load exercise data. Please check the JSON file path and contents.');
//             }
//         }; // <-- This closing brace was missing
//     } catch (error) {
//         console.error('Error accessing camera:', error);
//         alert('Could not access the camera. Please allow camera permissions and try again.');
//     }
// }


// async function onResults(results) {
//     console.log('Pose results received:', results);
//     controller.updateFrame(results);
// }

// async function processFrame(timestamp) {
//     //console.log('Processing frame at timestamp:', timestamp);
//     await pose.send({ image: videoElement });

//     const currentTime = timestamp / 1000; // Convert to seconds
    
//     canvasCtx.save();
//     canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
//     canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

//     controller.frame = canvasCtx;
//     const [currentPhase, exerciseName, repCount, totalReps] = controller.processExercise(currentTime);

//     if (repCount >= 0) {
//         printTextOnFrame(canvasCtx, `Exercise: ${exerciseName} | Reps: ${repCount}/${totalReps}`, 
//             { x: 10, y: 30 }, 'green');
//     }

//     canvasCtx.restore();
//     requestAnimationFrame(processFrame);
// }

// console.log('Setting up camera');
// setupCamera().catch(error => console.error('Setup camera failed:', error));


/**
 * exercisePlan
 *
 * Defines a series of “stages” for Anuvittasana. Each key must be unique
 * so the Controller can step through them sequentially.
 *
 * Format:
 *   {
 *     <stageName>: {
 *       json_path: '<path to normalized-keypoints JSON>',
 *       reps: <number of repetitions>
 *     },
 *     …
 *   }
 */



const exercisePlan = {
  Anuvittasana: {
    json_path: 'assets/Avuvittasana_female_video_keypoints.json',  
    reps:      3
  },
  Anuvittasana_2: {
    json_path: 'assets/Avuvittasana_female_video_keypoints.json',  
    reps:      2
  }
};
const controller = new Controller(exercisePlan);

/**
 * onResults(results)
 *
 * Callback invoked by MediaPipe whenever pose landmarks are available for the current frame.
 * - Updates the Controller with the latest landmarks.
 * - Clears and redraws the video frame on the canvas.
 * - Invokes Controller.processExercise() to get current phase, name, rep counts.
 * - Overlays the appropriate text: either “Workout Complete!” or “Exercise: …”.
 *
 * @param {Object} results
 *   MediaPipe Pose results containing poseLandmarks, etc.
 */

pose.onResults(results => {
  
  // Update the controller’s internal pose data
  controller.updateFrame(results);
  console.log('lastValidPoseTime:', controller.lastValidPoseTime);
  console.log('landmarks:',          controller.landmarks);
  console.log('hipPoint:',           controller.hipPoint);
  
  // Redraw the video frame onto canvas
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(videoElement,
                      0, 0,
                      canvasElement.width,
                      canvasElement.height);

  // Run exercise state machine for this timestamp
  const currentTime = performance.now() / 1000;
  const [phase, name, doneReps, totalReps] =
    controller.processExercise(currentTime);

    
  // Overlay text based on current phase
 if (phase === 'workout_complete') {
      printTextOnFrame(
          canvasCtx,
          'Workout Complete!',
          { x: 10, y: 30 },
          'gold'
      );
  } else if (doneReps >= 0) {
      printTextOnFrame(
          canvasCtx,
          `Exercise: ${name} | Reps: ${doneReps}/${totalReps}`,
          { x: 10, y: 30 },
          'green'
      );
  }


  canvasCtx.restore();
});


/**
 * onFrame()
 *
 * Feeds the current <video> frame into MediaPipe Pose and schedules the next frame.
 * This creates a continuous loop that processes each video frame for pose detection.
 */
async function onFrame() {
  await pose.send({ image: videoElement });
  requestAnimationFrame(onFrame);
}

/**
 * bootStrap()
 *
 * Main entry to set up video playback and kick off the processing loop:
 * - Waits for video metadata (dimensions) to load.
 * - Mutes and autoplay (to satisfy browser autoplay policies).
 * - Sizes the <canvas> to match videoWidth/videoHeight.
 * - Assigns the 2D context to controller.frame so drawing utilities can use it.
 * - Calls controller.initialize() to load JSON and build phase handlers.
 * - Starts the exercise sequence and begins the animation loop.
 *
 * Any error at any step will log to console and alert the user.
 */

(async () => {
  try {
    await new Promise(resolve => {
      videoElement.onloadedmetadata = resolve;
      videoElement.load();
    });

    videoElement.muted     = true;
    videoElement.autoplay  = true;
    videoElement.loop      = true;
    videoElement.playsInline = true;
    await videoElement.play();

    canvasElement.width  = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    controller.frame = canvasCtx;


    await controller.initialize();
    if (!controller.segments.length) {
      throw new Error('No exercise segments loaded; check your JSON path!');
    }
    controller.startExerciseSequence();
    
    console.log(`here we go: ${controller.landmarks}`);

    requestAnimationFrame(onFrame);

  } catch (err) {
    console.error('Initialization failed:', err);
    alert('Could not start Yoga Tracker. See console for details.');
  }
})();
