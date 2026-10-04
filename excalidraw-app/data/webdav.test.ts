import { vi } from "vitest";
import {
  listExcalidrawFiles,
  downloadWebDAVFile,
  uploadWebDAVFile,
  renameWebDAVFile,
  deleteWebDAVFile,
} from "./webdav";

it("keeps WebDAV file requests under the service prefix and encodes filenames", async () => {
  const config = {
    serverUrl: "https://example.test/dav/user",
    basePath: "/drawings",
    username: "test-user",
    password: "test-only",
  };
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({
      ok: true,
      text: async () =>
        `<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/user/drawings/%E8%AF%BE%E7%A8%8B%20%231.excalidraw</d:href><d:propstat><d:prop><d:resourcetype/></d:prop></d:propstat></d:response></d:multistatus>`,
      blob: async () => new Blob(["scene"]),
    } as Response);
  try {
    const files = await listExcalidrawFiles(config);
    expect(files[0].path).toBe("/drawings/课程 #1.excalidraw");
    await downloadWebDAVFile(config, files[0].path);
    await uploadWebDAVFile(config, files[0].path, "scene");
    await renameWebDAVFile(config, files[0].path, "new #2");
    await deleteWebDAVFile(config, files[0].path);
    for (const [url] of fetchMock.mock.calls.slice(1)) {
      expect(url).toBe(
        "https://example.test/dav/user/drawings/%E8%AF%BE%E7%A8%8B%20%231.excalidraw",
      );
    }
    expect(fetchMock.mock.calls[3][1]?.headers).toMatchObject({
      Destination:
        "https://example.test/dav/user/drawings/new%20%232.excalidraw",
    });
  } finally {
    fetchMock.mockRestore();
  }
});
