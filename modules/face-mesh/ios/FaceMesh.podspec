Pod::Spec.new do |s|
  s.name           = 'FaceMesh'
  s.version        = '1.0.0'
  s.summary        = 'MediaPipe Face Landmarker for Rewind'
  s.author         = 'Rewind'
  s.homepage       = 'https://example.invalid/rewind'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'MediaPipeTasksVision', '~> 1.0'
  s.source_files   = '*.swift'
  s.resource_bundles = { 'FaceMesh' => ['face_landmarker.task'] }
end
