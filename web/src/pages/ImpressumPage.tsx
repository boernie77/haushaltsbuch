import { LegalMissingNotice, OperatorAddress } from "../components/LegalOperator";
import { useAppConfig } from "../hooks/useAppConfig";

const DEFAULT_SOURCE_URL = "https://github.com/boernie77/haushaltsbuch";

export default function ImpressumPage() {
  const { config, loading } = useAppConfig();
  const legal = config?.legal;
  const sourceUrl = config?.sourceUrl || DEFAULT_SOURCE_URL;
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 font-bold text-2xl text-gray-900 dark:text-gray-100">
        Impressum
      </h1>

      {legal ? (
        <>
          <section className="mb-6">
            <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
              Angaben gemäß § 5 DDG
            </h2>
            <OperatorAddress legal={legal} />
          </section>

          {legal.email && (
            <section className="mb-6">
              <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
                Kontakt
              </h2>
              <p className="text-gray-700 dark:text-gray-300">
                E-Mail:{" "}
                <a
                  className="text-[var(--primary)] hover:underline"
                  href={`mailto:${legal.email}`}
                >
                  {legal.email}
                </a>
              </p>
            </section>
          )}

          <section className="mb-6">
            <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
              Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
            </h2>
            <OperatorAddress legal={legal} />
          </section>
        </>
      ) : (
        !loading && <LegalMissingNotice page="Impressum" />
      )}

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          Software und Quellcode
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          Haushaltsbuch ist freie Software unter der{" "}
          <a
            className="text-[var(--primary)] hover:underline"
            href="https://www.gnu.org/licenses/agpl-3.0.html"
            rel="noopener noreferrer"
            target="_blank"
          >
            GNU Affero General Public License v3.0
          </a>
          . Der Quellcode ist frei verfügbar:{" "}
          <a
            className="text-[var(--primary)] hover:underline"
            href={sourceUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {sourceUrl}
          </a>
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          Verwendete Open-Source-Lizenzen
        </h2>
        <p className="mb-3 text-gray-700 dark:text-gray-300">
          Diese Anwendung verwendet unter anderem folgende Open-Source-Pakete:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-gray-700 text-sm dark:text-gray-300">
            <thead>
              <tr className="border-gray-200 border-b dark:border-gray-700">
                <th className="py-2 pr-4 text-left font-semibold">Paket</th>
                <th className="py-2 text-left font-semibold">Lizenz</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["React, React Native", "MIT"],
                ["Expo", "MIT"],
                ["Express", "MIT"],
                ["Sequelize", "MIT"],
                ["React Native Paper", "MIT"],
                ["Tailwind CSS", "MIT"],
                ["Recharts", "MIT"],
                ["Anthropic SDK (@anthropic-ai/sdk)", "MIT"],
                ["react-native-mmkv", "MIT"],
                ["@expo/vector-icons, react-native-vector-icons", "MIT"],
                ["axios, date-fns, zustand, zod", "MIT"],
                ["bcryptjs, jsonwebtoken, node-cron, multer", "MIT"],
                ["lucide-react", "ISC"],
                ["Sharp", "Apache 2.0"],
                ["ssh2-sftp-client", "Apache 2.0"],
              ].map(([pkg, lic]) => (
                <tr
                  className="border-gray-100 border-b dark:border-gray-800"
                  key={pkg}
                >
                  <td className="py-2 pr-4">{pkg}</td>
                  <td className="py-2">{lic}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
