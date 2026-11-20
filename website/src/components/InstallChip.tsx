import { CopyButton } from "./CodeBlock";

export default function InstallChip({ command = "pnpm add choropleth-kit" }: { command?: string }) {
  return (
    <div className="install">
      <code>
        <span className="install-prompt" aria-hidden="true">
          $
        </span>{" "}
        {command}
      </code>
      <CopyButton text={command} label={`Copy the install command: ${command}`} />
    </div>
  );
}
