export default function ImpressumPage() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 font-bold text-2xl text-gray-900 dark:text-gray-100">
        Impressum
      </h1>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          Angaben gemäß § 5 TMG
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          Christian Bernauer
          <br />
          Dianastr. 2b
          <br />
          90547 Stein
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          Kontakt
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          E-Mail:{" "}
          <a
            className="text-[var(--primary)] hover:underline"
            href="mailto:christian@bernauer24.com"
          >
            christian@bernauer24.com
          </a>
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          Christian Bernauer
          <br />
          Dianastr. 2b
          <br />
          90547 Stein
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          Verwendete Open-Source-Lizenzen
        </h2>
        <p className="mb-3 text-gray-700 dark:text-gray-300">
          Diese Anwendung verwendet Open-Source-Software. Alle eingesetzten
          Pakete stehen unter permissiven Lizenzen (MIT, Apache 2.0, ISC), die
          eine kommerzielle Nutzung ausdrücklich erlauben.
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
