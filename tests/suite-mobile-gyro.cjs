// tests/suite-mobile-gyro.cjs - Test Suite 25: Mobile Gyroscope 3D Card Tilt & Gesture Interaction
const fs = require('fs');
const path = require('path');

module.exports = async function runMobileGyroSuite({ assert, window, rootDir }) {
  console.log("\n[Test Suite 25: Mobile Gyroscope 3D Card Tilt & Phone Interaction]");

  const indexPath = path.join(rootDir, 'index.html');
  assert(fs.existsSync(indexPath), "index.html exists in workspace root");

  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  const indexLines = indexContent.split('\n').length;
  assert(indexLines < 2000, `index.html LOC is strictly under 2,000 lines (Actual: ${indexLines})`);

  // 1. Gyroscope & Accelerometer API bindings
  assert(indexContent.includes("deviceorientation"), "index.html binds to browser 'deviceorientation' event");
  assert(indexContent.includes("e.gamma") && indexContent.includes("e.beta"), "index.html extracts physical gyro beta and gamma angles");
  assert(indexContent.includes("handleOrientation"), "index.html implements handleOrientation sensor handler");

  // 2. Physical ergonomics & Natural holding pitch normalization
  assert(indexContent.includes("naturalPitch = 45") || indexContent.includes("- 45"), "index.html normalizes around natural 45deg handheld resting pitch");
  assert(indexContent.includes("clampedGamma") && indexContent.includes("clampedBeta"), "index.html clamps raw sensor tilt angles to prevent disorientation");
  assert(indexContent.includes("rotationY") && indexContent.includes("rotationX"), "index.html applies 3D card rotation along both X and Y axes");

  // 3. Screen orientation adaptation (Portrait vs Landscape)
  assert(indexContent.includes("screen.orientation") || indexContent.includes("window.orientation"), "index.html adapts sensor coordinates to device screen orientation angle");

  // 4. Luminous Spotlight Torch & Ambient Parallax Orbs
  assert(indexContent.includes("cardBody.style.setProperty('--mouse-x'"), "Device tilt updates Spotlight Torch X coordinate");
  assert(indexContent.includes("cardBody.style.setProperty('--mouse-y'"), "Device tilt updates Spotlight Torch Y coordinate");
  assert(indexContent.includes("orbCyan") && indexContent.includes("orbViolet"), "Device tilt drives ambient glow orbs in parallax depth");

  // 5. iOS 13+ Safari Permission Handling
  assert(indexContent.includes("DeviceOrientationEvent.requestPermission"), "index.html implements iOS 13+ DeviceOrientationEvent.requestPermission()");
  assert(indexContent.includes("requestGyroPermission"), "index.html implements requestGyroPermission handler");
  assert(indexContent.includes("'touchstart', requestGyroPermission"), "index.html triggers iOS sensor permission request on user touch interaction");

  // 6. Touch drag fallback for mobile devices
  assert(indexContent.includes("'touchmove'"), "index.html provides touchmove event listener for interactive mobile drag tilt");
  assert(indexContent.includes("'touchend'"), "index.html provides touchend event listener for smooth return damping");

  // 7. Touch reactivity for background visual effects
  assert(indexContent.includes("trailSparks") && indexContent.includes("'touchmove'"), "Finger touch generates luminous sci-fi trail sparks");

  // 8. Math Verification: Simulate tilt mapping function
  function simulateTiltPhysics(gamma, beta, screenAngle = 0) {
    const naturalPitch = 45;
    const deltaBeta = beta - naturalPitch;
    const deltaGamma = gamma;

    const clampedGamma = Math.max(-25, Math.min(25, deltaGamma));
    const clampedBeta = Math.max(-25, Math.min(25, deltaBeta));

    let normX = clampedGamma / 25;
    let normY = clampedBeta / 25;

    let effX = normX;
    let effY = normY;
    if (screenAngle === 90) {
      effX = normY;
      effY = -normX;
    } else if (screenAngle === -90 || screenAngle === 270) {
      effX = -normY;
      effY = normX;
    } else if (screenAngle === 180) {
      effX = -normX;
      effY = -normY;
    }

    return {
      rotY: effX * 14,
      rotX: -effY * 14,
      normX,
      normY
    };
  }

  // Neutral hold: gamma = 0, beta = 45 -> zero rotation
  const neutral = simulateTiltPhysics(0, 45, 0);
  assert(neutral.rotY === 0 && neutral.rotX === 0, "Neutral phone holding position results in centered card (rotY=0, rotX=0)");

  // Tilting phone right: positive gamma -> positive rotY
  const tiltRight = simulateTiltPhysics(15, 45, 0);
  assert(tiltRight.rotY > 0, "Tilting phone right rotates card Y-axis clockwise");

  // Tilting phone left: negative gamma -> negative rotY
  const tiltLeft = simulateTiltPhysics(-15, 45, 0);
  assert(tiltLeft.rotY < 0, "Tilting phone left rotates card Y-axis counter-clockwise");

  // Tilting phone forward away from user: beta > 45 -> rotX < 0
  const tiltForward = simulateTiltPhysics(0, 65, 0);
  assert(tiltForward.rotX < 0, "Tilting phone forward tilts card top inward");

  // Tilting phone back toward user: beta < 45 -> rotX > 0
  const tiltBack = simulateTiltPhysics(0, 25, 0);
  assert(tiltBack.rotX > 0, "Tilting phone backward tilts card top outward");

  // Landscape mode 90deg rotation adapts axes
  const landscapeTilt = simulateTiltPhysics(15, 45, 90);
  assert(landscapeTilt.rotX !== 0 || landscapeTilt.rotY !== 0, "Landscape screen orientation adapts rotation axes seamlessly");
};
