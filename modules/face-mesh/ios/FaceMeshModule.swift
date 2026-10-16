import ExpoModulesCore
import MediaPipeTasksVision

public class FaceMeshModule: Module {
  private var landmarker: FaceLandmarker?
  private let lock = NSLock()

  private func makeLandmarker() throws -> FaceLandmarker {
    if let landmarker { return landmarker }
    guard let bundleURL = Bundle(for: FaceMeshModule.self).url(forResource: "FaceMesh", withExtension: "bundle"),
          let modelPath = Bundle(url: bundleURL)?.path(forResource: "face_landmarker", ofType: "task") else {
      throw Exception(name: "ERR_FACE_MESH_MODEL", description: "face_landmarker.task is missing from the FaceMesh bundle")
    }
    let options = FaceLandmarkerOptions()
    options.baseOptions.modelAssetPath = modelPath
    options.runningMode = .image
    options.numFaces = 1
    options.outputFaceBlendshapes = true
    options.outputFacialTransformationMatrixes = true
    let created = try FaceLandmarker(options: options)
    landmarker = created
    return created
  }

  public func definition() -> ModuleDefinition {
    Name("FaceMesh")

    AsyncFunction("detect") { (uri: URL) -> [String: Any]? in
      guard let image = UIImage(contentsOfFile: uri.path) else {
        throw Exception(name: "ERR_FACE_MESH_DECODE", description: "Could not decode \(uri.path)")
      }
      lock.lock()
      defer { lock.unlock() }
      let result = try makeLandmarker().detect(image: try MPImage(uiImage: image))
      guard let face = result.faceLandmarks.first else { return nil }
      var landmarks: [Double] = []
      landmarks.reserveCapacity(face.count * 3)
      for p in face { landmarks += [Double(p.x), Double(p.y), Double(p.z)] }
      var blendshapes: [String: Double] = [:]
      for c in result.faceBlendshapes.first?.categories ?? [] {
        if let name = c.categoryName { blendshapes[name] = Double(c.score) }
      }
      var matrix: [Double] = []
      if let m = result.facialTransformationMatrixes.first {
        for row in 0..<4 { for col in 0..<4 { matrix.append(Double(m.value(atRow: UInt(row), column: UInt(col)))) } }
      }
      return [
        "width": Int(image.size.width * image.scale),
        "height": Int(image.size.height * image.scale),
        "landmarks": landmarks,
        "blendshapes": blendshapes,
        "matrix": matrix,
      ]
    }
  }
}
