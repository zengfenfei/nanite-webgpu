import {
  BindingsCache,
  PIPELINE_DEPTH_STENCIL_ON,
  PIPELINE_PRIMITIVE_TRIANGLE_LIST,
  assignResourcesToBindings2,
  getClearColorVec3,
  labelPipeline,
  labelShader,
  useColorAttachment,
  useDepthStencilAttachment,
} from '../_shared.ts';
import { PassCtx } from '../passCtx.ts';
import { NaniteObject } from '../../scene/naniteObject.ts';
import { SHADER_CODE, SHADER_PARAMS } from './rasterizeHwPass.wgsl.ts';
import { getDiffuseTexture } from '../../scene/scene.ts';
import { assertIsGPUTextureView } from '../../utils/webgpu.ts';

export class RasterizeHwPass {
  public static NAME: string = 'RasterizeHwPass';

  private readonly renderPipeline: GPURenderPipeline;
  private readonly bindingsCache = new BindingsCache();

  constructor(device: GPUDevice, outTextureFormat: GPUTextureFormat) {
    this.renderPipeline = RasterizeHwPass.createRenderPipeline(
      device,
      outTextureFormat
    );
  }

  private static createRenderPipeline(
    device: GPUDevice,
    outTextureFormat: GPUTextureFormat
  ) {
    const shaderModule = device.createShaderModule({
      label: labelShader(RasterizeHwPass),
      code: SHADER_CODE(),
    });

    return device.createRenderPipeline({
      label: labelPipeline(RasterizeHwPass),
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'main_vs',
        buffers: [], // no vertex attributes
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'main_fs',
        targets: [{ format: outTextureFormat }],
      },
      primitive: PIPELINE_PRIMITIVE_TRIANGLE_LIST,
      depthStencil: PIPELINE_DEPTH_STENCIL_ON,
    });
  }

  cmdHardwareRasterize(
    ctx: PassCtx,
    naniteObject: NaniteObject,
    loadOp: GPULoadOp
  ) {
    const { cmdBuf, profiler, depthTexture, hdrRenderTexture } = ctx;

    // https://developer.mozilla.org/en-US/docs/Web/API/GPUCommandEncoder/beginRenderPass
    const renderPass = cmdBuf.beginRenderPass({
      label: RasterizeHwPass.NAME,
      colorAttachments: [
        useColorAttachment(hdrRenderTexture, getClearColorVec3(), loadOp),
      ],
      depthStencilAttachment: useDepthStencilAttachment(depthTexture, loadOp),
      timestampWrites: profiler?.createScopeGpu(RasterizeHwPass.NAME),
    });
    const bindings = this.bindingsCache.getBindings(naniteObject.name, () =>
      this.createBindings(ctx, naniteObject)
    );

    // set render pass data
    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, bindings);

    // draw
    naniteObject.buffers.cmdDrawMeshletsHardwareIndirect(renderPass);

    // fin
    renderPass.end();
  }

  private createBindings = (
    { device, globalUniforms, scene }: PassCtx,
    naniteObject: NaniteObject
  ): GPUBindGroup => {
    const b = SHADER_PARAMS.bindings;
    const buffers = naniteObject.buffers;
    const diffuseTextureView = getDiffuseTexture(scene, naniteObject);
    assertIsGPUTextureView(diffuseTextureView);

    return assignResourcesToBindings2(
      RasterizeHwPass,
      naniteObject.name,
      device,
      this.renderPipeline,
      [
        globalUniforms.createBindingDesc(b.renderUniforms),
        buffers.bindMeshletData(b.meshlets),
        buffers.bindDrawnMeshletsList(b.drawnMeshletIds),
        naniteObject.bindInstanceTransforms(b.instancesTransforms),
        buffers.bindVertexPositions(b.vertexPositions),
        buffers.bindVertexNormals(b.vertexNormals),
        buffers.bindVertexUVs(b.vertexUV),
        buffers.bindIndexBuffer(b.indexBuffer),
        { binding: b.diffuseTexture, resource: diffuseTextureView },
        { binding: b.sampler, resource: scene.samplerLinear },
      ]
    );
  };
}
