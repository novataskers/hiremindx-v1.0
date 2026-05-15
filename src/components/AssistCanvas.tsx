"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X, Maximize2, Minimize2, Code, Eye, Copy, Check, RotateCcw,
  Smartphone, Monitor, Sparkles, Download, Rocket,
  ExternalLink, Github, Loader2,
} from "lucide-react";

interface AssistCanvasProps {
  code: string;
  isStreaming?: boolean;
  onClose: () => void;
}

type ViewMode = "preview" | "code";
type DeviceMode = "desktop" | "mobile";

// Split code into virtual "files" for IDE-like code view
interface CodeFile {
  name: string;
  language: string;
  content: string;
}

function splitIntoFiles(html: string): CodeFile[] {
  const files: CodeFile[] = [];

  // Extract CSS
  const styleMatches = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  let cssContent = "";
  if (styleMatches) {
    cssContent = styleMatches
      .map(m => m.replace(/<\/?style[^>]*>/gi, "").trim())
      .join("\n\n");
  }

  // Extract JS
  const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  let jsContent = "";
  if (scriptMatches) {
    jsContent = scriptMatches
      .filter(m => !m.includes("src=")) // Skip external scripts
      .map(m => m.replace(/<\/?script[^>]*>/gi, "").trim())
      .join("\n\n");
  }

  // Always show the full HTML first
  files.push({ name: "index.html", language: "html", content: html });

  // Add separated CSS if substantial
  if (cssContent.length > 50) {
    files.push({ name: "styles.css", language: "css", content: cssContent });
  }

  // Add separated JS if substantial
  if (jsContent.length > 50) {
    files.push({ name: "script.js", language: "javascript", content: jsContent });
  }

  return files;
}

export function AssistCanvas({ code, isStreaming, onClose }: AssistCanvasProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [deployedProjectId, setDeployedProjectId] = useState<string | null>(null);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extract the HTML from AI response — handles truncated/unclosed blocks
  const extractHTML = useCallback((raw: string): string => {
    if (!raw) return "";
    // Match ```html block, closed or truncated (no closing backticks)
    const htmlBlockMatch = raw.match(/```html\s*\n([\s\S]*?)(?:```|$)/);
    if (htmlBlockMatch) {
      let content = htmlBlockMatch[1].trim();
      // Strip any trailing partial backticks from truncation
      content = content.replace(/\n`{1,2}$/, "").trim();
      return content;
    }
    // Match generic code block, closed or truncated
    const genericBlockMatch = raw.match(/```\s*\n([\s\S]*?)(?:```|$)/);
    if (genericBlockMatch) {
      let content = genericBlockMatch[1].trim().replace(/\n`{1,2}$/, "").trim();
      if (content.includes("<") && (content.includes("</") || content.includes("/>"))) return content;
    }
    const trimmed = raw.trim();
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.startsWith("<HTML")) return trimmed;
    const largeHTMLMatch = raw.match(/(<!DOCTYPE[\s\S]{200,})/i);
    if (largeHTMLMatch) return largeHTMLMatch[1].trim();
    if (trimmed.includes("<") && trimmed.includes("</")) {
      const firstTag = trimmed.indexOf("<");
      const htmlPart = trimmed.substring(firstTag);
      if (htmlPart.length > 50) {
        return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <base target="_blank">\n  <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'Inter', system-ui, sans-serif; background: #0a0a0a; color: #e4e4e7; }</style>\n</head>\n<body>\n${htmlPart}\n</body>\n</html>`;
      }
    }
    return "";
  }, []);

  // Detect if extracted HTML appears structurally truncated
  const isIncompleteHTML = useCallback((html: string): boolean => {
    if (!html) return false;
    const trimmed = html.trim().toLowerCase();
    const hasDoctype = trimmed.startsWith("<!doctype");
    const hasHtmlOpen = /<html[\s>]/.test(html);
    const hasHtmlClose = /<\/html>/.test(html);
    const hasBodyOpen = /<body[\s>]/.test(html);
    const hasBodyClose = /<\/body>/.test(html);
    const hasHeadOpen = /<head[\s>]/.test(html);
    const hasHeadClose = /<\/head>/.test(html);
    // Missing closing tags on a full HTML document strongly indicates truncation
    if (hasDoctype && hasHtmlOpen && !hasHtmlClose) return true;
    if (hasDoctype && hasBodyOpen && !hasBodyClose) return true;
    if (hasDoctype && hasHeadOpen && !hasHeadClose) return true;
    return false;
  }, []);

  // Inject <base target="_blank"> to prevent navigation
  const injectBaseTarget = useCallback((html: string): string => {
    if (!html) return html;
    if (/<base\s/i.test(html)) return html;
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, '<head$1>\n  <base target="_blank">');
    if (html.startsWith("<!DOCTYPE")) return html.replace(/(<!DOCTYPE[^>]*>\s*<html[^>]*>)/i, '$1\n<head><base target="_blank"></head>');
    return html;
  }, []);

  const htmlContentRaw = extractHTML(code);
  const isIncomplete = isIncompleteHTML(htmlContentRaw);

  // Auto-fix truncated HTML by appending missing closing tags
  const htmlContent = useMemo(() => {
    let html = htmlContentRaw;
    if (!html || !isIncomplete) return html;
    // Close any unclosed tags that the browser would complain about
    if (!html.includes("</body>")) html += "\n</body>";
    if (!html.includes("</html>")) html += "\n</html>";
    return html;
  }, [htmlContentRaw, isIncomplete]);

  const safeHTML = injectBaseTarget(htmlContent);
  const codeFiles = splitIntoFiles(htmlContent);

  const [renderedHtml, setRenderedHtml] = useState<string>(isStreaming ? "" : safeHTML);

  // Debounced iframe update to prevent flashing
  useEffect(() => {
    if (!safeHTML) return;
    if (!isStreaming) {
      setRenderedHtml(safeHTML);
      return;
    }
    const timer = setTimeout(() => {
      setRenderedHtml(safeHTML);
    }, 1500);
    return () => clearTimeout(timer);
  }, [safeHTML, isStreaming]);

  const handleCopy = () => {
    const content = viewMode === "code" && codeFiles[activeFileIndex]
      ? codeFiles[activeFileIndex].content
      : htmlContent || code;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRefresh = () => {
    if (safeHTML) {
      setRenderedHtml("");
      setTimeout(() => setRenderedHtml(safeHTML), 50);
    }
  };

  // Download as ZIP using JSZip from CDN
  const handleDownload = async () => {
    if (!htmlContent) return;
    try {
      // Dynamically load JSZip
      const JSZipModule = await import("jszip").catch(() => null);
      if (JSZipModule?.default) {
        const zip = new JSZipModule.default();
        zip.file("index.html", htmlContent);
        zip.file("vercel.json", JSON.stringify({ version: 2, builds: [{ src: "index.html", use: "@vercel/static" }], routes: [{ src: "/(.*)", dest: "/index.html" }] }, null, 2));
        zip.file("package.json", JSON.stringify({ name: "hiremindx-canvas-project", version: "1.0.0", description: "Created with HireMindX Assist Canvas", scripts: { start: "npx serve ." } }, null, 2));
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "project.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Fallback: download as single HTML file
        const blob = new Blob([htmlContent], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "project.html";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      // Fallback
      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "project.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Deploy to HireMindX hosting (supports both new deploy and redeploy)
  const handleVercelDeploy = async () => {
    if (deploying) return;
    const deployCode = htmlContent || code;
    if (!deployCode) {
      alert('No code to deploy. Please generate a project first.');
      return;
    }
    setDeploying(true);
    try {
      const payload: Record<string, string> = { code: deployCode, action: 'deploy' };
      // If we already deployed, send the projectId to UPDATE instead of creating new
      if (deployedProjectId) {
        payload.projectId = deployedProjectId;
      }
      const res = await fetch('/api/assist/canvas-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) {
        console.error('Deploy error:', data.error);
        alert('Deploy failed: ' + data.error);
        return;
      }
      if (data.deployUrl) {
        setDeployUrl(data.deployUrl);
      }
      if (data.projectId) {
        setDeployedProjectId(data.projectId);
      }
    } catch (e) {
      console.error('Deploy error:', e);
      alert('Deploy failed. Please try again.');
    } finally {
      setDeploying(false);
    }
  };

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);
  const getDeviceWidth = () => deviceMode === "mobile" ? "375px" : "100%";

  // Generating state
  if (!htmlContent && isStreaming) {
    return (
      <div className="h-full flex flex-col bg-[#0c0c0c] border-l border-zinc-800">
        <div className="flex items-center justify-between px-4 h-12 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
            <span className="text-sm font-medium text-zinc-300">Canvas</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mx-auto border border-blue-500/20">
              <Code className="w-7 h-7 text-blue-400 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-300">Generating preview...</p>
              <p className="text-xs text-zinc-600 mt-1">Writing code for your request</p>
            </div>
            <div className="flex items-center justify-center gap-1">
              {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!htmlContent && !isStreaming) {
    return (
      <div className="h-full flex flex-col bg-[#0c0c0c] border-l border-zinc-800">
        <div className="flex items-center justify-between px-4 h-12 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2"><Code className="w-4 h-4 text-zinc-500" /><span className="text-sm font-medium text-zinc-300">Canvas</span></div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 flex items-center justify-center"><p className="text-sm text-zinc-600">No preview available</p></div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`flex flex-col bg-[#0c0c0c] border-l border-zinc-800 canvas-enter ${isFullscreen ? "fixed inset-0 z-[100]" : "h-full"}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 h-12 border-b border-zinc-800 flex-shrink-0 gap-2">
        <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5">
          <button onClick={() => setViewMode("preview")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "preview" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`} title="Preview">
            <Eye className="w-3.5 h-3.5" /><span className="hidden sm:inline">Preview</span>
          </button>
          <button onClick={() => setViewMode("code")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "code" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`} title="Code">
            <Code className="w-3.5 h-3.5" /><span className="hidden sm:inline">Code</span>
          </button>
        </div>

        {viewMode === "preview" && (
          <div className="flex items-center gap-0.5 bg-zinc-900 rounded-lg p-0.5">
            {([{ mode: "mobile" as DeviceMode, icon: Smartphone }, { mode: "desktop" as DeviceMode, icon: Monitor }]).map(({ mode, icon: Icon }) => (
              <button key={mode} onClick={() => setDeviceMode(mode)} className={`p-1.5 rounded-md transition-colors ${deviceMode === mode ? "bg-zinc-800 text-white" : "text-zinc-600 hover:text-zinc-400"}`} title={mode}>
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-0.5">
          {isStreaming && (
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 mr-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />Streaming
            </span>
          )}
          <button onClick={handleRefresh} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Refresh"><RotateCcw className="w-3.5 h-3.5" /></button>
          <button onClick={handleCopy} className={`p-1.5 rounded-lg transition-colors ${copied ? "text-emerald-400 bg-emerald-500/10" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"}`} title="Copy">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleDownload} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Download ZIP"><Download className="w-3.5 h-3.5" /></button>
          <button onClick={() => setShowPublishModal(true)} className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors" title="Publish"><Rocket className="w-3.5 h-3.5" /></button>
          <button onClick={toggleFullscreen} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors" title="Close"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {/* Preview View */}
        <div className={`flex-1 flex-col bg-zinc-950 overflow-auto ${viewMode === "preview" ? "flex" : "hidden"}`}>
          <div className="flex-1 items-start justify-center p-2 min-h-0">
            <div className="bg-white rounded-lg overflow-hidden shadow-2xl transition-all duration-300" style={{ width: getDeviceWidth(), maxWidth: "100%", height: deviceMode === "desktop" ? "100%" : "auto", minHeight: deviceMode === "desktop" ? "100%" : "667px" }}>
              <iframe ref={iframeRef} title="Canvas Preview" sandbox="allow-scripts allow-popups allow-forms" className="w-full h-full border-0" style={{ minHeight: deviceMode === "desktop" ? "100%" : "667px" }} srcDoc={renderedHtml} />
            </div>
          </div>
        </div>

        {/* Code View */}
        <div className={`flex-1 flex-col bg-zinc-950 overflow-hidden ${viewMode === "code" ? "flex" : "hidden"}`}>
          {/* File tabs */}
          <div className="flex items-center gap-0 border-b border-zinc-800 bg-zinc-900/50 overflow-x-auto flex-shrink-0">
            {codeFiles.map((file, i) => (
              <button
                key={file.name}
                onClick={() => setActiveFileIndex(i)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-r border-zinc-800 transition-colors whitespace-nowrap ${
                  activeFileIndex === i
                    ? "bg-zinc-950 text-white border-b-2 border-b-blue-500"
                    : "bg-zinc-900/30 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
                }`}
                title={file.name}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  file.language === "html" ? "bg-orange-400" :
                  file.language === "css" ? "bg-blue-400" :
                  file.language === "javascript" ? "bg-yellow-400" : "bg-zinc-500"
                }`} />
                <span className="hidden sm:inline">{file.name}</span>
                <span className="sm:hidden font-mono uppercase text-[10px]">{file.language === "javascript" ? "JS" : file.language}</span>
              </button>
            ))}
          </div>
          {/* Code content */}
          <div className="flex-1 overflow-auto p-4">
            <div className="flex">
              {/* Line numbers */}
              <div className="flex flex-col items-end pr-4 select-none border-r border-zinc-800 mr-4 flex-shrink-0">
                {(codeFiles[activeFileIndex]?.content || "").split("\n").map((_, i) => (
                  <span key={i} className="text-[11px] font-mono text-zinc-700 leading-relaxed">{i + 1}</span>
                ))}
              </div>
              {/* Code */}
              <pre className="text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap break-words flex-1">
                <code>{codeFiles[activeFileIndex]?.content || ""}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Publish Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowPublishModal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl publish-modal-enter" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center border border-emerald-500/20">
                  <Rocket className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-white">Publish Project</h3>
              </div>
              <button onClick={() => setShowPublishModal(false)} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"><X className="w-4 h-4" /></button>
            </div>

            <p className="text-xs text-zinc-400 mb-5">Deploy your project live or push code to a repository.</p>

            {deployUrl && deployUrl !== 'clipboard' && (
              <div className="mb-4 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                <p className="text-xs font-medium text-emerald-400 mb-1">🎉 Deployed Successfully!</p>
                <a href={deployUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline break-all">{deployUrl}</a>
              </div>
            )}

            <div className="space-y-3">
              {/* Deploy Live / Redeploy */}
              <button
                onClick={handleVercelDeploy}
                disabled={deploying}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-600 transition-all group disabled:opacity-50"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                  {deploying ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Rocket className="w-5 h-5 text-white" />}
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium text-zinc-200 group-hover:text-white">
                    {deploying ? (deployedProjectId ? 'Updating...' : 'Deploying...') : (deployedProjectId ? 'Redeploy Update' : 'Deploy Live')}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {deploying ? 'Publishing your project...' : (deployedProjectId ? 'Push your latest edits to the live URL' : 'Get an instant live URL')}
                  </p>
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
              </button>

              {/* Push to GitHub */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(htmlContent || code);
                  alert('Code copied to clipboard! Paste it into your new repository files.');
                  window.open(`https://github.com/new?name=hiremindx-canvas-project&description=Created+with+HireMindX+Assist+Canvas`, "_blank");
                  setShowPublishModal(false);
                }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-600 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0"><Github className="w-5 h-5 text-white" /></div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium text-zinc-200 group-hover:text-white">Create GitHub Repo</p>
                  <p className="text-[11px] text-zinc-500">Copies code & opens GitHub new repo page</p>
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
              </button>

              {/* Preview in New Tab */}
              <button
                onClick={() => {
                  const blob = new Blob([htmlContent], { type: "text/html" });
                  const url = URL.createObjectURL(blob);
                  window.open(url, "_blank");
                  setShowPublishModal(false);
                }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-600 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0"><ExternalLink className="w-5 h-5 text-white" /></div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium text-zinc-200 group-hover:text-white">Preview in New Tab</p>
                  <p className="text-[11px] text-zinc-500">Open full preview in browser</p>
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .canvas-enter { animation: canvasSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
        .publish-modal-enter { animation: modalPopIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes canvasSlideIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes modalPopIn { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
    </div>
  );
}
