
import { NetworkImageScanner } from './network-image-scanner';
import { App, TFile, Vault } from 'obsidian';

// Mock Obsidian types
const mockFile = {
    path: 'test.md',
    extension: 'md',
    stat: { ctime: 0, mtime: 0, size: 0 }
} as unknown as TFile;

const mockVault = {
    getMarkdownFiles: jest.fn(),
    read: jest.fn(),
} as unknown as Vault;

const mockApp = {
    vault: mockVault,
} as unknown as App;

describe('NetworkImageScanner', () => {
    let scanner: NetworkImageScanner;

    beforeEach(() => {
        scanner = new NetworkImageScanner(mockApp);
        jest.clearAllMocks();
    });

    test('should scan markdown files for markdown image links', async () => {
        (mockVault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
        (mockVault.read as jest.Mock).mockResolvedValue('Here is an image: ![alt](http://example.com/image.png)');

        const results = await scanner.scan();

        expect(results).toHaveLength(1);
        expect(results[0].url).toBe('http://example.com/image.png');
        expect(results[0].sourceFile).toBe(mockFile);
        expect(results[0].originalText).toBe('![alt](http://example.com/image.png)');
    });

    test('should scan markdown files for HTML image tags', async () => {
        (mockVault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
        (mockVault.read as jest.Mock).mockResolvedValue('Here is an image: <img src="https://example.com/image.jpg" alt="test">');

        const results = await scanner.scan();

        expect(results).toHaveLength(1);
        expect(results[0].url).toBe('https://example.com/image.jpg');
    });

    test('should ignore localhost images', async () => {
        (mockVault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
        (mockVault.read as jest.Mock).mockResolvedValue('![local](http://localhost:3000/img.png) <img src="http://127.0.0.1/img.png">');

        const results = await scanner.scan();

        expect(results).toHaveLength(0);
    });

    test('should filter by path', async () => {
        const file1 = { ...mockFile, path: 'folder1/test.md' } as TFile;
        const file2 = { ...mockFile, path: 'folder2/test.md' } as TFile;
        
        (mockVault.getMarkdownFiles as jest.Mock).mockReturnValue([file1, file2]);
        (mockVault.read as jest.Mock).mockResolvedValue('![img](http://example.com/img.png)');

        const results = await scanner.scan('folder1');

        expect(results).toHaveLength(1);
        expect(results[0].sourceFile).toBe(file1);
    });

    test('should handle read errors gracefully', async () => {
        (mockVault.getMarkdownFiles as jest.Mock).mockReturnValue([mockFile]);
        (mockVault.read as jest.Mock).mockRejectedValue(new Error('Read failed'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const results = await scanner.scan();

        expect(results).toHaveLength(0);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});
