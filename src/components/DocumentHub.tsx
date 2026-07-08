/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { 
  FolderOpen, 
  Plus, 
  Trash2, 
  X, 
  Send, 
  RefreshCw, 
  HelpCircle,
  FileText,
  Sparkles,
  MessageSquare,
  Upload
} from "lucide-react";
import { UploadedDocument } from "../types";

export default function DocumentHub() {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload Form
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [fileName, setFileName] = useState("");
  const [textContent, setTextContent] = useState("");
  const [fileType, setFileType] = useState("text/plain");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [fileFeedback, setFileFeedback] = useState("");
  const [parsingFile, setParsingFile] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    setFileFeedback("");
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ["txt", "md", "pdf", "docx"];
    if (!allowedExtensions.includes(extension || "")) {
      setError("Yalnızca .txt, .md, .pdf, .doc ve .docx uzantılı dosyalar desteklenmektedir.");
      return;
    }

    setParsingFile(true);
    setFileFeedback("Dosya yükleniyor ve içeriği yapay zeka motoru ile analiz ediliyor, lütfen bekleyin...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const headers = {
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`
      };

      const res = await fetch("/api/ai/documents/parse", {
        method: "POST",
        headers,
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Dosya işlenirken sunucuda bir hata oluştu.");
      }

      const data = await res.json();
      setTextContent(data.text);
      setFileName(data.fileName);
      
      let mappedType = "text/plain";
      if (extension === "md") mappedType = "text/markdown";
      else if (extension === "pdf") mappedType = "application/pdf";
      setFileType(mappedType);

      setFileFeedback(`"${file.name}" başarıyla çözümlendi! Dosya içerisindeki tüm metin (${data.text.length} karakter) aşağıdaki "Rehber Metin İçeriği" alanına otomatik olarak aktarıldı. Bilgileri inceleyip ardından kaydetme butonuna basabilirsiniz.`);
    } catch (err: any) {
      console.error(err);
      setError(`Dosya okunurken hata oluştu: ${err.message || err}`);
      setFileFeedback("");
    } finally {
      setParsingFile(false);
    }
  };

  // Chatbot Assistant State
  const [chatQuery, setChatQuery] = useState("");
  const [chatMessages, setChatMessages] = useState<any[]>([
    { sender: "bot", text: "Merhaba, ben Mersin AgriTech RAG asistanınız. Tarım rehberleriniz ve zeytinlik verileriniz doğrultusunda sorularınızı cevaplayabilirim. Ne sormak istersiniz?" }
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch("/api/ai/documents", { headers });
      if (res.ok) {
        setDocuments(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!fileName || !textContent) {
      setError("Doküman adı ve kılavuz içeriği (metin) zorunludur.");
      return;
    }

    setSaving(true);
    try {
      const headers = { 
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };

      const res = await fetch("/api/ai/documents/upload", {
        method: "POST",
        headers,
        body: JSON.stringify({
          fileName,
          fileType,
          textContent
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Doküman dizine eklenemedi.");
      }

      setFileName("");
      setTextContent("");
      setFileFeedback("");
      setShowUploadForm(false);
      fetchDocuments();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!window.confirm("Bu dokümanı ve bağlı tüm vektör indekslerini silmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/ai/documents/${id}`, {
        method: "DELETE",
        headers
      });

      if (res.ok) {
        fetchDocuments();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim()) return;

    const userMsg = { sender: "user", text: chatQuery };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatQuery("");
    setChatLoading(true);

    try {
      const headers = { 
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ query: userMsg.text })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Yapay zeka yanıt üretemedi.");
      }

      setChatMessages((prev) => [...prev, { sender: "bot", text: data.response || data.text }]);
    } catch (err: any) {
      setChatMessages((prev) => [...prev, { sender: "bot", text: `Yanıt alınırken hata oluştu: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-24">
        <RefreshCw className="h-8 w-8 text-[#556b2f] animate-spin" />
        <span className="text-sm font-medium text-[#5a6a55]">Bilgi bankası ve dokümanlar yükleniyor...</span>
      </div>
    );
  }

  return (
    <div id="document-hub-tab" className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#1a2416] tracking-tight">RAG Doküman Havuzu</h1>
          <p className="text-sm text-[#5a6a55] mt-1">
            Zirai kitaplar, tescilli zeytin yetiştiriciliği kılavuzları ve ilaç prospektüsleri yükleme ve anlık RAG arama asistanı
          </p>
        </div>
        <button
          id="add-document-btn"
          onClick={() => {
            setShowUploadForm(!showUploadForm);
            setFileFeedback("");
            setFileName("");
            setTextContent("");
            setError("");
          }}
          className="self-start flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#556b2f] hover:bg-[#415324] rounded-2xl transition-all shadow-sm"
        >
          {showUploadForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span>{showUploadForm ? "Vazgeç" : "Yeni Rehber Kitap Ekle"}</span>
        </button>
      </div>

      {showUploadForm && (
        <form onSubmit={handleUploadDocument} className="bg-[#fcfdfc] p-6 rounded-3xl border border-[#e2e8df] space-y-4 max-w-3xl animate-slide-up shadow-sm">
          <h2 className="text-md font-bold text-[#1a2416]">RAG Vektör Dizini İçin Doküman Ekle</h2>
          
          {/* Drag & Drop File Selector Zone */}
          <div className={`border-2 border-dashed rounded-2xl p-5 bg-[#fcfdfc] flex flex-col items-center justify-center text-center transition-colors relative group ${
            parsingFile ? "border-[#556b2f] bg-[#f4f7f3]" : "border-[#cdd4ca] hover:border-[#556b2f]/60 cursor-pointer"
          }`}>
            {!parsingFile && (
              <input 
                type="file" 
                accept=".txt,.md,.pdf,.docx"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            )}
            <div className={`p-3 rounded-2xl mb-2 transition-transform duration-200 ${
              parsingFile ? "bg-[#556b2f] text-white animate-bounce" : "bg-[#f0f4ee] text-[#556b2f] group-hover:scale-105"
            }`}>
              {parsingFile ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </div>
            <p className="text-xs font-bold text-[#1a2416]">
              {parsingFile ? "Dosya Çözümleniyor, Lütfen Bekleyin..." : "Bilgisayarınızdan bir dosya seçin veya buraya sürükleyin"}
            </p>
            <p className="text-[10px] text-[#80907a] mt-1">
              {parsingFile ? "Yapay zeka motoru dosyadaki tüm metni çıkartıyor..." : "Desteklenen formatlar: .txt, .md, .pdf, .docx, .doc"}
            </p>
          </div>

          {fileFeedback && (
            <div className="text-xs bg-[#f4f7f3] text-[#2d3a2a] border border-[#dee5db] p-3 rounded-2xl flex items-start gap-2 animate-fade-in shadow-sm">
              <Sparkles className="h-4 w-4 text-[#556b2f] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[#556b2f]">Dosya Bilgisi:</p>
                <p className="text-[#5a6a55] mt-0.5">{fileFeedback}</p>
              </div>
            </div>
          )}

          {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-xl">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] mb-1">Doküman Başlığı / Kitap Adı</label>
              <input
                type="text"
                required
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="Örn: Zeytin Yetiştiriciliğinde Don Mücadelesi Kılavuzu"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5a6a55] mb-1">Format / Tür</label>
              <select
                value={fileType}
                onChange={(e) => setFileType(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              >
                <option value="text/plain">Düz Metin (TXT / Markdown)</option>
                <option value="application/pdf">Bakanlık Zirai Kitapçığı</option>
                <option value="text/markdown">Uygulama Prospektüsü</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5a6a55] mb-1">Rehber Metin İçeriği</label>
            <textarea
              rows={8}
              required
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Doküman veya kitapçığın içeriğindeki zeytin hastalıkları, bakır dozajlama, ayaz kırağı yönetimi gibi kritik tarımsal metinleri buraya yapıştırın. Yapay zeka bu metni akıllı parçalara ayırarak vektör dizinine kaydedecek ve karar anında referans alacaktır..."
              className="w-full px-4 py-3 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f] font-mono text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-[#556b2f] text-white font-bold rounded-2xl text-xs hover:bg-[#415324] disabled:opacity-50 transition-all"
          >
            {saving ? "Metin Çözümlenip Vektör Dizini Çıkartılıyor..." : "Dizine Ekle ve Kaydet"}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Indexed Handbooks List */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-sm font-bold text-[#5a6a55] uppercase tracking-wider">Bilgi Bankasındaki Kılavuzlar ({documents.length})</h2>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {documents.length > 0 ? (
              documents.map((doc) => (
                <div id={`doc-card-${doc.id}`} key={doc.id} className="bg-[#fcfdfc] border border-[#e2e8df] p-4 rounded-3xl shadow-sm flex items-start justify-between">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-[#556b2f] shrink-0" />
                      <h3 className="font-bold text-sm text-[#1a2416] truncate" title={doc.fileName}>{doc.fileName}</h3>
                    </div>
                    <p className="text-[10px] text-[#80907a] font-mono">Boyut: {(doc.fileSize / 1024).toFixed(1)} KB • Ekleyen: {doc.uploadedBy}</p>
                    {doc.summary && (
                      <p className="text-[11px] text-[#5a6a55] leading-normal bg-[#f7f9f6] p-2 rounded-xl border border-[#dee5db]/60 mt-2">
                        {doc.summary}
                      </p>
                    )}
                  </div>

                  <button
                    id={`delete-doc-btn-${doc.id}`}
                    onClick={() => handleDeleteDocument(doc.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 ml-2"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            ) : (
              <div className="p-8 text-center bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl">
                <FileText className="h-8 w-8 text-[#80907a] mx-auto mb-2" />
                <p className="text-xs text-[#5a6a55] italic">Dizinde kayıtlı rehber kitapçık bulunmamaktadır.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: RAG Conversation Chat-bot */}
        <div className="lg:col-span-2 bg-white border border-[#e2e8df] rounded-3xl shadow-sm flex flex-col h-[550px] overflow-hidden">
          {/* Chat Header */}
          <div className="px-6 py-4 border-b border-[#f0f4ee] flex items-center justify-between bg-[#fcfdfc] rounded-t-3xl">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-[#f0f4ee] text-[#556b2f] rounded-xl">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-base text-[#1a2416]">AgriTech RAG Tarım Asistanı</h2>
                <p className="text-[10px] text-[#80907a] mt-0.5">Yüklediğiniz zirai dökümanlara göre çalışan akıllı danışman</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[#556b2f] bg-[#f0f4ee] px-2 py-0.5 rounded-full">RAG Aktif</span>
              <span className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
            </div>
          </div>

          {/* Chat Messages Log */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-[#f4f7f3]">
            {/* Guide Info Banner */}
            <div className="bg-gradient-to-r from-white to-[#fcfdfc] border border-[#dee5db] rounded-2xl p-4 text-xs text-[#2d3a2a] leading-relaxed shadow-sm space-y-1.5">
              <div className="flex items-center gap-2 text-[#556b2f] font-bold">
                <Sparkles className="h-4 w-4" />
                <span>RAG Bilgi Tabanı Nasıl Çalışır?</span>
              </div>
              <p className="text-[11px] text-[#5a6a55]">
                Sol tarafa ekleyeceğiniz her zirai kitapçık veya ilaç prospektüsü akıllı vektör dizinine dönüştürülür. Sağdaki asistanımız, sorduğunuz soruları yanıtlarken <strong>doğrudan yüklediğiniz bu belgeleri</strong> referans alır.
              </p>
              {documents.length === 0 && (
                <div className="text-[11px] bg-amber-50 text-amber-900 border border-amber-200/60 p-2.5 rounded-xl font-medium mt-2 flex items-start gap-1.5">
                  <HelpCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    <strong>Henüz doküman eklenmedi:</strong> Sol üstteki <strong>"Yeni Rehber Kitap Ekle"</strong> butonunu kullanarak kendi tarım kılavuzlarınızı sisteme ekleyebilirsiniz. Şu an asistan zeytin yetiştiriciliği konusunda genel bilgi birikimi ile yanıt vermektedir.
                  </span>
                </div>
              )}
            </div>

            {chatMessages.map((msg, index) => {
              const isBot = msg.sender === "bot";
              return (
                <div key={index} className={`flex ${isBot ? "justify-start" : "justify-end"} animate-fade-in`}>
                  <div className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed space-y-2 shadow-sm ${
                    isBot 
                      ? "bg-white text-[#2d3a2a] rounded-bl-none border border-[#dee5db]" 
                      : "bg-[#556b2f] text-white rounded-br-none"
                  }`}>
                    <span className={`block text-[9px] font-bold tracking-wider uppercase opacity-65 font-mono mb-1 ${isBot ? "text-[#5a6a55]" : "text-[#d6e0d2]"}`}>
                      {isBot ? "Mersin AgriTech" : "Kullanıcı"}
                    </span>
                    <div className="markdown-body prose max-w-none text-xs leading-relaxed">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            })}

            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-[#dee5db] rounded-2xl rounded-bl-none p-4 flex items-center gap-2 shadow-sm">
                  <RefreshCw className="h-3.5 w-3.5 text-[#556b2f] animate-spin" />
                  <span className="text-[11px] font-semibold text-[#5a6a55]">Gemini tescilli zirai veritabanını tarıyor...</span>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Area */}
          <form onSubmit={handleSendChatMessage} className="p-4 border-t border-[#f0f4ee] bg-white rounded-b-3xl flex gap-2">
            <input
              id="rag-chat-input"
              type="text"
              value={chatQuery}
              onChange={(e) => setChatQuery(e.target.value)}
              placeholder="Halkalı leke için hangi zirai ilacı hangi dozda uygulamalıyım?"
              className="flex-1 px-4 py-2.5 bg-[#f7f9f6] border border-[#cdd4ca] rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-[#556b2f] focus:bg-white"
            />
            <button
              id="rag-chat-send-btn"
              type="submit"
              disabled={chatLoading}
              className="px-4 py-2.5 bg-[#556b2f] text-white rounded-2xl hover:bg-[#415324] disabled:opacity-50 transition-all shadow-sm"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
