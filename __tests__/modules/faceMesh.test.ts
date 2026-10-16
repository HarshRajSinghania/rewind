const mockNative = { detect: jest.fn() };
let mockPresent = true;
jest.mock('expo', () => ({ requireOptionalNativeModule: () => (mockPresent ? mockNative : null) }));

describe('face-mesh wrapper', () => {
  beforeEach(() => jest.resetModules());

  it('passes the file uri to the native detector', async () => {
    mockPresent = true;
    mockNative.detect.mockResolvedValue(null);
    const { detectFaceMesh, isFaceMeshAvailable } = require('@/modules/face-mesh');
    expect(isFaceMeshAvailable()).toBe(true);
    await expect(detectFaceMesh('file:///a.jpg')).resolves.toBeNull();
    expect(mockNative.detect).toHaveBeenCalledWith('file:///a.jpg');
  });

  it('reports unavailable without the native module and refuses to detect', async () => {
    mockPresent = false;
    const { detectFaceMesh, isFaceMeshAvailable } = require('@/modules/face-mesh');
    expect(isFaceMeshAvailable()).toBe(false);
    await expect(detectFaceMesh('file:///a.jpg')).rejects.toThrow('FaceMesh native module is not available');
  });
});
