import { mat4 } from 'wgpu-matrix';
import Input from './sys_web/input.ts';
import { CONFIG, CAMERA_CFG } from './constants.ts';

export interface CameraOpts {
  position?: [number, number, number];
  target?: [number, number, number];
}

type Mat4 = any;

const UP = [0, 1, 0];

export class Camera {
  public viewMatrix: Mat4;

  constructor(
    options: Pick<typeof CAMERA_CFG, 'position' | 'target'> = CAMERA_CFG
  ) {
    this.viewMatrix = mat4.lookAt(options.position, options.target, UP);
  }

  focusBoundingBox(boundingBox: { min: number[]; max: number[] }) {

    const center = [
      (boundingBox.min[0] + boundingBox.max[0]) / 2,
      (boundingBox.min[1] + boundingBox.max[1]) / 2,
      (boundingBox.min[2] + boundingBox.max[2]) / 2,
    ];
    const halfY = (boundingBox.max[1] - boundingBox.min[1]) / 2;
    const halfZ = (boundingBox.max[2] - boundingBox.min[2]) / 2;
    const halfX = (boundingBox.max[0] - boundingBox.min[0]) / 2;

    const eye = [center[0], center[1], center[2] + halfY / Math.tan((CAMERA_CFG.fovDgr / 2) * Math.PI / 180) + halfZ];

    this.viewMatrix = mat4.lookAt(
      eye,
      center,
      UP
    )
  }

  translate(x: number, y: number, z: number) {
    const viewInv = mat4.inverse(this.viewMatrix);
    mat4.translate(viewInv, [x, y, z], viewInv);
    mat4.inverse(viewInv, this.viewMatrix);
  }

  rotate(x: number, y: number, z: number) {
    const viewInv = mat4.inverse(this.viewMatrix);
    mat4.rotateX(viewInv, y, viewInv);
    mat4.rotateY(viewInv, x, viewInv);
    mat4.rotateZ(viewInv, z, viewInv);
    mat4.inverse(viewInv, this.viewMatrix);
  }

  update(deltaTime: number, input: Input): Mat4 {
    const sign = (positive: boolean, negative: boolean) =>
      (positive ? 1 : 0) - (negative ? 1 : 0);

    const m = deltaTime * CONFIG.movementSpeed;
    const digital = input.directions;
    const deltaRight = m * sign(digital.right, digital.left);
    const deltaUp = m * sign(digital.up, digital.down);
    const deltaBack = m * sign(digital.backward, digital.forward);
    this.translate(deltaRight, deltaUp, deltaBack);

    let yaw = input.mouse.x * deltaTime * CONFIG.rotationSpeed;
    let pitch = input.mouse.y * deltaTime * CONFIG.rotationSpeed;
    yaw = mod(yaw, Math.PI * 2);
    pitch = clamp(pitch, -Math.PI / 2, Math.PI / 2);
    this.rotate(-yaw, -pitch, 0);
  }
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max);
}

function mod(x: number, div: number): number {
  return x - Math.floor(Math.abs(x) / div) * div * Math.sign(x);
}
