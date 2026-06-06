import type { ComponentProps } from "react";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type ImportFaturaSourceTab = "texto" | "arquivo";

type ImportFaturaSourceTabsSectionProps = {
  importTab: ImportFaturaSourceTab;
  onImportTabChange: (value: ImportFaturaSourceTab) => void;
  importTexto: string;
  onImportTextoChange: (value: string) => void;
  onParseTexto: () => void;
  isParseDisabled?: boolean;
  fileInputRef: ComponentProps<"input">["ref"];
  onFileSelected: (file: File) => void;
  onUploadClick: () => void;
  isUploadDisabled: boolean;
  uploadButtonLabel: string;
};

export function ImportFaturaSourceTabsSection({
  importTab,
  onImportTabChange,
  importTexto,
  onImportTextoChange,
  onParseTexto,
  isParseDisabled = false,
  fileInputRef,
  onFileSelected,
  onUploadClick,
  isUploadDisabled,
  uploadButtonLabel,
}: ImportFaturaSourceTabsSectionProps) {
  return (
    <Tabs value={importTab} onValueChange={(value) => onImportTabChange(value as ImportFaturaSourceTab)}>
      <TabsList className="w-full">
        <TabsTrigger value="texto" className="flex-1">Colar texto / CSV</TabsTrigger>
        <TabsTrigger value="arquivo" className="flex-1">Enviar arquivo</TabsTrigger>
      </TabsList>

      <TabsContent value="texto" className="space-y-3">
        <Label>Cole o extrato da fatura (texto livre, CSV, ou linha por linha)</Label>
        <Textarea
          data-testid="textarea-import-texto"
          value={importTexto}
          onChange={(event) => onImportTextoChange(event.target.value)}
          placeholder={"Exemplos:\n25/02 NETFLIX 60,00 1/1\n01/02 LOJA ABC 150,00 3/10\n\nOu CSV:\nData,Descricao,Valor\n25/02/2026,NETFLIX,60.00"}
          rows={6}
          className="font-mono text-sm"
        />
        <Button
          onClick={onParseTexto}
          className="w-full"
          data-testid="button-parse-texto"
          disabled={isParseDisabled}
        >
          <FileText className="w-4 h-4 mr-2" /> Detectar compras
        </Button>
      </TabsContent>

      <TabsContent value="arquivo" className="space-y-3">
        <div className="space-y-3 rounded-lg border-2 border-dashed p-4 text-center sm:p-8">
          <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Arraste ou selecione o arquivo</p>
            <p className="text-xs text-muted-foreground">
              Formatos suportados: CSV, OFX, QFX, TXT e PDF textual (PDF escaneado ainda não)
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.ofx,.qfx,.txt,.pdf"
            className="hidden"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) onFileSelected(selected);
              event.currentTarget.value = "";
            }}
          />
          <Button
            variant="outline"
            onClick={onUploadClick}
            disabled={isUploadDisabled}
            data-testid="button-upload-file"
          >
            {uploadButtonLabel}
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
