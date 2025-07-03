// main.js
// Entry point for the Yoga Tracker visualizer.
// Handles video source selection (camera or upload), feeds frames into MediaPipe Pose,
// and delegates pose processing to the Controller for exercise segmentation and rep counting.

import { Controller } from './controller/controller.js';          // Core logic for exercise segmentation & rep counting
import { printTextOnFrame } from './utils/camera_utils.js';      // Utility to overlay text on the canvas

console.log('Starting main.js');

// Grab references to DOM elements
const videoElement = document.getElementById('videoElement');      // <video> displaying camera/upload
const canvasElement = document.getElementById('outputCanvas');     // <canvas> overlay for drawing results
const canvasCtx = canvasElement.getContext('2d');                  // Canvas 2D drawing context
const cameraBtn = document.getElementById('cameraBtn');            // Button to start webcam
const uploadBtn = document.getElementById('uploadBtn');            // Button to trigger file upload
const videoUploadInput = document.getElementById('videoUploadInput'); // Hidden <input type="file">

console.log('Initializing MediaPipe Pose');
// Initialize MediaPipe Pose solution
const pose = new Pose({
    locateFile: (file) => {
        console.log(`Loading MediaPipe file: ${file}`);
        // Load model and WASM files from CDN
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});
// Configure Pose parameters
pose.setOptions({
    modelComplexity: 2,             // Use the most complex (and accurate) model
    minDetectionConfidence: 0.5,    // Minimum confidence for initial detection
    minTrackingConfidence: 0.5      // Minimum confidence for tracking landmarks
});
// Register callback when Pose has results
pose.onResults(onResults);

// Define the exercise plan: mapping exercise names to keypoint JSON & target reps
const exercisePlan = {
    "Anuvittasana": {
        "json_path": "assets/Tadasana_Ideal_video.json",
        "reps": 3
    }
};

console.log('Creating Controller instance');
// Instantiate the Controller with our exercise plan
const controller = new Controller(exercisePlan);

let videoSource = null;    // Tracks whether source is 'camera' or 'upload'
let lastVideoTime = -1;    // For uploaded videos, avoid reprocessing the same frame

// =======================
// Event Listeners
// =======================

// When "Use Camera" clicked: stop any existing source, then start webcam
cameraBtn.addEventListener('click', () => {
    stopVideoSources();
    setupCamera();
    videoSource = 'camera';
});

// When "Upload Video" clicked: open file selector
uploadBtn.addEventListener('click', () => {
    videoUploadInput.click();
});

// When a file is selected: stop existing source, then load & process the uploaded video
videoUploadInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        stopVideoSources();
        handleVideoUpload(e.target.files[0]);
        videoSource = 'upload';
    }
});

// =======================
// Video Source Management
// =======================

// Stop and clean up any existing video source (camera stream or uploaded video)
function stopVideoSources() {
    // If using camera: stop all media tracks
    if (videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoElement.srcObject = null;
    }
    // If using upload: revoke blob URL and clear src
    if (videoElement.src) {
        URL.revokeObjectURL(videoElement.src);
        videoElement.src = '';
    }
}

// Request access to the webcam and stream into <video>
async function setupCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('MediaDevices API not supported');
        alert('Please use HTTPS and a supported browser');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;
        videoElement.onloadedmetadata = () => {
            initializeVideoProcessing();
        };
    } catch (error) {
        console.error('Camera error:', error);
        alert('Camera access denied. Please allow permissions.');
    }
}

// Load the uploaded video file into <video> and loop it
function handleVideoUpload(file) {
    const url = URL.createObjectURL(file);
    videoElement.src = url;
    videoElement.onloadedmetadata = () => {
        initializeVideoProcessing();
    };
    videoElement.loop = true;
}

// =======================
// Video Processing Pipeline
// =======================

// Once video metadata is ready, size the canvas, initialize Controller, and start the loop
function initializeVideoProcessing() {
    // Match canvas size to video dimensions
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    // Load exercise segments (from JSON) into the controller
    controller.initialize().then(() => {
        if (controller.segments.length > 0) {
            controller.startExerciseSequence();  // Prepare for first exercise
            lastVideoTime = -1;
            requestAnimationFrame(processFrame); // Begin frame-by-frame processing
        } else {
            console.error('Failed to initialize segments');
            alert('Exercise data failed to load');
        }
    }).catch(error => {
        console.error('Controller init error:', error);
    });
}

// Callback invoked by MediaPipe Pose when a pose has been detected in the latest frame
async function onResults(results) {
    controller.updateFrame(results);  // Supply pose landmarks & segmentation mask to Controller
}

// Core loop: grab a frame, send to Pose, draw video + overlays, compute reps & phases
async function processFrame(timestamp) {
    // For uploads: skip processing if video time hasn't advanced
    if (videoSource === 'upload') {
        if (videoElement.currentTime === lastVideoTime) {
            requestAnimationFrame(processFrame);
            return;
        }
        lastVideoTime = videoElement.currentTime;
    }

    // Send current video frame to MediaPipe Pose
    await pose.send({ image: videoElement });
    
    // Draw base video frame onto canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    // Compute elapsed time in seconds for exercise logic
    const currentTime = timestamp / 1000;
    controller.frame = canvasCtx;  // Give Controller the canvas context to draw on
    // processExercise returns [phase, name, repsCompleted, totalReps]
    const [currentPhase, exerciseName, repCount, totalReps] = controller.processExercise(currentTime);

    // If we're in an active rep, overlay the exercise name and rep count
    if (repCount >= 0) {
        printTextOnFrame(
            canvasCtx,
            `Exercise: ${exerciseName} | Reps: ${repCount}/${totalReps}`,
            { x: 10, y: 30 },
            'green'
        );
    }

    canvasCtx.restore();
    // Loop to next animation frame
    requestAnimationFrame(processFrame);
}



// import { Controller } from './controller/controller.js';
// import { printTextOnFrame } from './utils/camera_utils.js';

// console.log('Starting main.js');
// const videoElement = document.getElementById('videoElement');
// const canvasElement = document.getElementById('outputCanvas');
// const canvasCtx = canvasElement.getContext('2d');
// const cameraBtn = document.getElementById('cameraBtn');
// const uploadBtn = document.getElementById('uploadBtn');
// const videoUploadInput = document.getElementById('videoUploadInput');

// console.log('Initializing MediaPipe Pose');
// const pose = new Pose({
//     locateFile: (file) => {
//         console.log(`Loading MediaPipe file: ${file}`);
//         return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
//     }
// });
// pose.setOptions({
//     modelComplexity: 2,
//     minDetectionConfidence: 0.5,
//     minTrackingConfidence: 0.5
// });
// pose.onResults(onResults);

// const exercisePlan = {
//     "Anuvittasana": {
//         "json_path": "assets/Avuvittasana_female_video_keypoints.json",
//         "reps": 3
//     }
// };

// console.log('Creating Controller instance');
// const controller = new Controller(exercisePlan);
// let videoSource = null; // 'camera' or 'upload'
// let lastVideoTime = -1;

// // Set up camera
// cameraBtn.addEventListener('click', () => {
//     stopVideoSources();
//     setupCamera();
//     videoSource = 'camera';
// });

// // Set up video upload
// uploadBtn.addEventListener('click', () => {
//     videoUploadInput.click();
// });

// videoUploadInput.addEventListener('change', (e) => {
//     if (e.target.files && e.target.files[0]) {
//         stopVideoSources();
//         handleVideoUpload(e.target.files[0]);
//         videoSource = 'upload';
//     }
// });

// function stopVideoSources() {
//     // Stop camera stream if exists
//     if (videoElement.srcObject) {
//         const tracks = videoElement.srcObject.getTracks();
//         tracks.forEach(track => track.stop());
//         videoElement.srcObject = null;
//     }
    
//     // Clear uploaded video if exists
//     if (videoElement.src) {
//         URL.revokeObjectURL(videoElement.src);
//         videoElement.src = '';
//     }
// }

// async function setupCamera() {
//     if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
//         console.error('MediaDevices API not supported');
//         alert('Please use HTTPS and a supported browser');
//         return;
//     }

//     try {
//         const stream = await navigator.mediaDevices.getUserMedia({ video: true });
//         videoElement.srcObject = stream;
//         videoElement.onloadedmetadata = () => {
//             initializeVideoProcessing();
//         };
//     } catch (error) {
//         console.error('Camera error:', error);
//         alert('Camera access denied. Please allow permissions.');
//     }
// }

// function handleVideoUpload(file) {
//     const url = URL.createObjectURL(file);
//     videoElement.src = url;
//     videoElement.onloadedmetadata = () => {
//         initializeVideoProcessing();
//     };
//     videoElement.loop = true;
// }

// function initializeVideoProcessing() {
//     canvasElement.width = videoElement.videoWidth;
//     canvasElement.height = videoElement.videoHeight;
    
//     controller.initialize().then(() => {
//         if (controller.segments.length > 0) {
//             controller.startExerciseSequence();
//             lastVideoTime = -1;
//             requestAnimationFrame(processFrame);
//         } else {
//             console.error('Failed to initialize segments');
//             alert('Exercise data failed to load');
//         }
//     }).catch(error => {
//         console.error('Controller init error:', error);
//     });
// }

// async function onResults(results) {
//     controller.updateFrame(results);
// }

// async function processFrame(timestamp) {
//     // For uploaded videos, only process new frames
//     if (videoSource === 'upload') {
//         if (videoElement.currentTime === lastVideoTime) {
//             requestAnimationFrame(processFrame);
//             return;
//         }
//         lastVideoTime = videoElement.currentTime;
//     }

//     await pose.send({ image: videoElement });
    
//     canvasCtx.save();
//     canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
//     canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

//     const currentTime = timestamp / 1000;
//     controller.frame = canvasCtx;
//     const [currentPhase, exerciseName, repCount, totalReps] = controller.processExercise(currentTime);

//     if (repCount >= 0) {
//         printTextOnFrame(canvasCtx, `Exercise: ${exerciseName} | Reps: ${repCount}/${totalReps}`, 
//             { x: 10, y: 30 }, 'green');
//     }

//     canvasCtx.restore();
//     requestAnimationFrame(processFrame);
// }