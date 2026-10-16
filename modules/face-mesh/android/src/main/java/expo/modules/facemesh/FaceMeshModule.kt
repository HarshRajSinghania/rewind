package expo.modules.facemesh

import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FaceMeshModule : Module() {
  private var landmarker: FaceLandmarker? = null

  /** Created on first use; MediaPipe tasks aren't thread-safe, so every call holds the lock. */
  private fun landmarker(): FaceLandmarker = landmarker ?: run {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val options = FaceLandmarker.FaceLandmarkerOptions.builder()
      .setBaseOptions(BaseOptions.builder().setModelAssetPath("face_landmarker.task").build())
      .setRunningMode(RunningMode.IMAGE)
      .setNumFaces(1)
      .setOutputFaceBlendshapes(true)
      .setOutputFacialTransformationMatrixes(true)
      .build()
    FaceLandmarker.createFromOptions(context, options).also { landmarker = it }
  }

  override fun definition() = ModuleDefinition {
    Name("FaceMesh")

    AsyncFunction("detect") { uri: String ->
      val path = Uri.parse(uri).path ?: throw CodedException("ERR_FACE_MESH_URI", "Not a file uri: $uri", null)
      val bitmap = BitmapFactory.decodeFile(path)
        ?: throw CodedException("ERR_FACE_MESH_DECODE", "Could not decode $path", null)
      try {
        val result = synchronized(this@FaceMeshModule) {
          landmarker().detect(BitmapImageBuilder(bitmap).build())
        }
        val face = result.faceLandmarks().firstOrNull() ?: return@AsyncFunction null
        val landmarks = ArrayList<Double>(face.size * 3)
        for (p in face) {
          landmarks.add(p.x().toDouble()); landmarks.add(p.y().toDouble()); landmarks.add(p.z().toDouble())
        }
        val blendshapes = HashMap<String, Double>()
        result.faceBlendshapes().orElse(null)?.firstOrNull()?.forEach { blendshapes[it.categoryName()] = it.score().toDouble() }
        // MediaPipe packs the 4x4 matrix column-major; JS expects row-major.
        val packed = result.facialTransformationMatrixes().orElse(null)?.firstOrNull()
        val matrix = if (packed != null) List(16) { i -> packed[(i % 4) * 4 + i / 4].toDouble() } else emptyList()
        mapOf(
          "width" to bitmap.width,
          "height" to bitmap.height,
          "landmarks" to landmarks,
          "blendshapes" to blendshapes,
          "matrix" to matrix,
        )
      } finally {
        bitmap.recycle()
      }
    }

    OnDestroy {
      synchronized(this@FaceMeshModule) {
        landmarker?.close()
        landmarker = null
      }
    }
  }
}
