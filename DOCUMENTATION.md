# Marble Maze - Technical Documentation

## Overview

A 3D marble maze game built with WebGPU for graphics rendering and Ammo.js for physics simulation. Players tilt the maze using arrow keys to guide a marble through the level.

## Project Structure

```
computer-graphics-project/
├── src/
│   ├── MarbleMaze.js              # Main entry point and setup
│   ├── config/
│   │   └── Constants.js           # Global constants
│   ├── input/
│   │   └── keyboardInput.js       # Arrow key input handling
│   ├── physics/
│   │   └── initPhysics.js         # Ammo.js physics simulation
│   ├── scene/
│   │   ├── frameLoop.js           # Main render loop
│   │   └── loadModelBuffers.js    # OBJ model loading
│   ├── webgpu/
│   │   ├── initWebGPU.js          # WebGPU initialization
│   │   ├── createPipeline.js      # Render pipeline setup
│   │   └── textureLoader.js       # Texture loading utility
│   └── libs/
│       ├── MV.js                  # Matrix/vector math library
│       ├── OBJParser.js           # OBJ file parser
│       └── ammo.js                # Bullet physics (Ammo.js)
├── models/
│   ├── sphere.obj                 # Marble model
│   └── board.obj                  # Maze board model
├── textures/
│   └── oak_veneer_01_diff_4k.jpg  # Wood texture
├── shaders/
│   └── main.wgsl                  # WebGPU shaders
├── index.html                     # HTML entry point
└── app.js                         # Application bootstrap
```

## Architecture

### 1. Initialization Flow (`MarbleMaze.js`)

**Entry Point**: `runMarbleMaze({ canvas, ui })`

The initialization follows this sequence:

1. **WebGPU Setup**
   - Initialize GPU device and context
   - Load WGSL shader code
   - Create render pipelines (main + shadow)

2. **Resources Creation**
   - Create depth/stencil buffer
   - Load 3D models (sphere, board)
   - Create uniform buffers (UBOs)
   - Load and setup textures

3. **Physics Initialization**
   - Initialize Ammo.js physics world
   - Create collision meshes from board geometry
   - Setup ball rigid body with physics properties

4. **Input Setup**
   - Attach keyboard event listeners
   - Map arrow keys to tilt controls

5. **Start Render Loop**
   - Begin continuous frame rendering

### 2. Physics System (`initPhysics.js`)

**Purpose**: Simulates realistic ball movement with gravity and collision

**Key Components**:
- **Dynamics World**: Bullet physics simulation environment
- **Floor Collider**: Static triangle mesh from board geometry
- **Ball Body**: Dynamic sphere rigid body (radius: 1, mass: 1)

**Tilt Mechanics**:
```
User Input → Tilt Angles → Rotated Gravity → Ball Rolls
```

The floor doesn't actually rotate. Instead:
1. User input adjusts pitch/roll angles
2. Gravity vector rotates based on tilt angles
3. Ball responds to tilted gravity naturally

**Key Methods**:
- `step(dt)`: Update physics simulation
- `getBallTransform()`: Get ball position + rotation quaternion
- `getFloorPositionAndRotation()`: Get current tilt state
- `setTiltInput(forward, right)`: Set tilt input from keyboard
- `resetBall()`: Reset ball when it falls off

**Physics Parameters**:
- Gravity: 9.81 m/s²
- Max tilt: 25 degrees
- Tilt speed: 0.4 rad/s
- Ball friction: 0.3
- Rolling friction: 0.02
- Reset threshold: Y < -10

### 3. Input System (`keyboardInput.js`)

**Purpose**: Convert arrow key presses to tilt inputs

**Mapping**:
- Arrow Up: Tilt forward (+1)
- Arrow Down: Tilt backward (-1)
- Arrow Right: Tilt right (+1)
- Arrow Left: Tilt left (-1)

**Features**:
- Diagonal movement normalization (maintains consistent speed)
- Prevents browser scrolling on arrow keys
- Continuous input (holds work correctly)

### 4. Render System (`frameLoop.js`)

**Purpose**: Main render loop that draws the scene every frame

**Render Pipeline**:

```
Physics Update → Camera Transform → Draw Board → Draw Ball → Draw Shadow
```

**Key Rendering Steps**:

1. **Physics Step**
   - Advance physics by 1/60 second
   - Get updated ball position and rotation
   - Get floor tilt angles

2. **Camera Setup**
   - Fixed orbital camera at 45° angle
   - Camera counter-rotates with tilt (keeps view stable)
   - Distance: 45 units from origin

3. **Transform Calculations**
   - Projection matrix (45° FOV, depth 0.1-100)
   - View matrix (lookAt with tilted up vector)
   - Model matrices for board and ball

4. **Geometry Pass**
   - Draw board with stencil write (marks shadow area)
   - Draw ball with full lighting

5. **Shadow Pass**
   - Project ball geometry onto floor plane
   - Only render where board stencil = 1
   - Use alpha blending for soft shadows

**Helper Functions**:
- `quatToMat4()`: Convert physics quaternion to 4x4 matrix
- `shadowMatrix()`: Generate shadow projection matrix
- `makeUniformData()`: Pack shader uniform data

**Material Parameters**:
- Diffuse scale: 5.8
- Specular scale: 1.0
- Shininess: 50
- Light emission: 25
- Ambient: 0.1

### 5. WebGPU Pipeline (`createPipeline.js`)

**Purpose**: Configure GPU rendering pipelines

**Two Pipelines**:

1. **Main Pipeline**
   - Vertex shader: `main_vs`
   - Fragment shader: `main_fs`
   - Depth test: enabled
   - Stencil: write mode
   - Outputs: textured + lit geometry

2. **Shadow Pipeline**
   - Vertex shader: `shadow_vs`
   - Fragment shader: `shadow_fs`
   - Depth write: disabled
   - Stencil: read-only, test for board area
   - Outputs: semi-transparent shadow

**Bind Group Layout**:
- Binding 0: Uniform buffer (matrices, lighting)
- Binding 1: Color texture
- Binding 2: Texture sampler

### 6. Model Loading (`loadModelBuffers.js`)

**Purpose**: Load OBJ files into GPU buffers

**Process**:
1. Parse OBJ file using `readOBJFile()`
2. Extract position, normal, UV data
3. Create GPU vertex buffers
4. Create GPU index buffer
5. Return buffer handles + metadata

**Buffer Types**:
- `vbuf`: Vertex positions (float32x4)
- `nbuf`: Vertex normals (float32x4)
- `uvbuf`: Texture coordinates (float32x2)
- `ibuf`: Triangle indices (uint32)

### 7. Texture Loading (`textureLoader.js`)

**Purpose**: Load image files as GPU textures

**Process**:
1. Load image from URL
2. Decode image data
3. Create bitmap
4. Create GPU texture (rgba8unorm format)
5. Copy bitmap to GPU
6. Return texture view

## Shader System (`main.wgsl`)

The WGSL shaders handle vertex transformation and fragment coloring.

**Vertex Shader** (`main_vs`):
- Transforms vertices by MVP matrix
- Transforms positions by model matrix
- Transforms normals by model matrix
- Passes UVs to fragment shader

**Fragment Shader** (`main_fs`):
- Samples color texture
- Calculates Blinn-Phong lighting
- Ambient + diffuse + specular components

**Shadow Shaders** (`shadow_vs`, `shadow_fs`):
- Projects ball geometry onto floor
- Outputs semi-transparent black

## Controls

| Key | Action |
|-----|--------|
| Arrow Up | Tilt forward |
| Arrow Down | Tilt backward |
| Arrow Left | Tilt left |
| Arrow Right | Tilt right |

## Performance Considerations

**Frame Rate**: 60 FPS target (physics locked to 60Hz)

**Optimizations**:
- Single draw call per object
- Static geometry (no dynamic updates)
- Texture filtering with mipmaps
- Backface culling enabled
- Efficient stencil-based shadows

**Memory**:
- UBO size: 512 bytes (2 mat4 + 6 vec4)
- Three separate UBOs: board, sphere, shadow
- Shared texture and sampler between objects

## Physics Notes

**Collision Detection**:
- Board uses BVH triangle mesh (exact collision)
- Ball uses sphere collider (fast and stable)

**Integration**:
- Fixed timestep: 1/60 second
- Max substeps: 10

**Ball Tuning**:
- Friction prevents sliding
- Rolling friction adds realistic feel
- Zero restitution (no bouncing)
- Always active (no sleeping)

## Rendering Notes

**Depth/Stencil Buffer**:
- Format: `depth24plus-stencil8`
- Depth: Standard depth testing
- Stencil: Used for shadow masking

**Shadow Technique**:
- Planar projection shadows
- Stencil masking to board area only
- Conditional rendering when ball is airborne

**Camera Behavior**:
- Fixed distance and angle
- Counter-rotates with tilt
- Smooth view of gameplay

## WebGPU Requirements

- WebGPU-enabled browser (Chrome 113+, Edge 113+)
- Supports compute shaders not required
- Texture compression not required

