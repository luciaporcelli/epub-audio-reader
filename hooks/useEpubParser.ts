import { useCallback } from 'react';
import { BookData, Chapter } from '../types';

declare const JSZip: any;

// Helper to convert ArrayBuffer to base64
const bufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
};


export const useEpubParser = () => {
    const parseEpub = useCallback(async (file: File): Promise<BookData> => {
        if (!file || !file.name.toLowerCase().endsWith('.epub')) {
            throw new Error('Please select a valid .epub file.');
        }

        const zip = await JSZip.loadAsync(file);
        const parser = new DOMParser();

        // 1. Find the .opf file path from container.xml
        const containerFile = zip.file('META-INF/container.xml');
        if (!containerFile) throw new Error('META-INF/container.xml not found in EPUB.');
        
        const containerXmlText = await containerFile.async('string');
        const containerDoc = parser.parseFromString(containerXmlText, 'application/xml');
        const rootfilePath = containerDoc.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
        if (!rootfilePath) throw new Error('Rootfile path not found in container.xml.');

        const opfFile = zip.file(rootfilePath);
        if (!opfFile) throw new Error(`.opf file not found at path: ${rootfilePath}`);
        
        const opfXmlText = await opfFile.async('string');
        const opfDoc = parser.parseFromString(opfXmlText, 'application/xml');
        const opfDir = rootfilePath.substring(0, rootfilePath.lastIndexOf('/'));
        
        // 2. Extract metadata from .opf
        const title = opfDoc.getElementsByTagName('dc:title')[0]?.textContent || 'Untitled';
        const author = opfDoc.getElementsByTagName('dc:creator')[0]?.textContent || 'Unknown Author';

        // 3. Create a map of manifest items
        const manifestItems = new Map<string, { href: string; mediaType: string }>();
        const manifest = opfDoc.getElementsByTagName('manifest')[0];
        manifest.querySelectorAll('item').forEach(item => {
            const id = item.getAttribute('id');
            const href = item.getAttribute('href');
            const mediaType = item.getAttribute('media-type');
            if (id && href && mediaType) {
                const fullPath = opfDir ? `${opfDir}/${href}` : href;
                manifestItems.set(id, { href: fullPath, mediaType });
            }
        });
        
        // 4. Find and extract cover image
        let coverImage: string | null = null;
        const metaCover = opfDoc.querySelector('meta[name="cover"]');
        const coverId = metaCover?.getAttribute('content');
        if (coverId) {
            const coverItem = manifestItems.get(coverId);
            if (coverItem) {
                const coverFile = zip.file(coverItem.href);
                if (coverFile) {
                    const buffer = await coverFile.async('arraybuffer');
                    const base64 = bufferToBase64(buffer);
                    coverImage = `data:${coverItem.mediaType};base64,${base64}`;
                }
            }
        }

        // 5. Read spine to get chapter order and content
        const spine = opfDoc.getElementsByTagName('spine')[0];
        const chapterPromises: Promise<Chapter>[] = [];
        spine.querySelectorAll('itemref').forEach(itemref => {
            const idref = itemref.getAttribute('idref');
            if (idref) {
                const chapterPath = manifestItems.get(idref)?.href;
                if (chapterPath) {
                    const chapterFile = zip.file(chapterPath);
                    if (chapterFile) {
                       const chapterPromise = chapterFile.async('string').then(htmlContent => {
                           const chapterDoc = parser.parseFromString(htmlContent, 'text/html');
                           const title = chapterDoc.querySelector('h1, h2, h3, title')?.textContent?.trim() || null;
                           const body = chapterDoc.body;
                           if (!body) return { id: idref, title, content: '' };
                           
                           body.querySelectorAll('script, style, link, head, header, footer, aside, nav').forEach(el => el.remove());
                           
                           let textContent = body.textContent || '';
                           textContent = textContent.replace(/\s\s+/g, ' ').trim();
                           
                           return {
                               id: idref,
                               title,
                               content: textContent,
                           };
                       });
                       chapterPromises.push(chapterPromise);
                    }
                }
            }
        });

        const chapters = await Promise.all(chapterPromises);
        
        return { title, author, coverImage, chapters: chapters.filter(c => c.content.length > 0) };
    }, []);

    return { parseEpub };
};
