# quan

个人分流规则仓库，主要存放 Clash/Mihomo 规则集、Egern 规则集，以及少量模块/脚本配置。

## 根目录 YAML 配置文件

根目录下的 `.yaml` 多数是给 Clash / Mihomo / OpenClash 使用的 rule-provider 规则集，统一采用：

```yaml
payload:
  - DOMAIN-SUFFIX,example.com
```

当前文件说明：

- `direct.yaml`：其他直连分流规则，包含域名、IP 段和端口规则。
- `proxy.yaml`：其他代理分流规则。
- `crypto.yaml`：加密货币相关服务分流规则，例如 Bybit、Binance 及相关域名/IP。
- `krak.yaml`：Krak / Kraken 支付 App 代理分流规则（Kraken 旗下金融 App）。
- `copilot.yaml`：Microsoft Copilot 及其相关服务的代理分流规则。
- `module-redirect.yaml`：Egern 模块跳转配置，用于将部分插件/模块安装链接改写为 Egern 导入链接。

## egern 目录

`egern/` 目录存放给 Egern 使用的规则集，是根目录部分规则的 Egern 格式版本。

Egern 规则不使用 `payload:`，而是按规则类型拆成不同集合，例如：

```yaml
domain_suffix_set:
- example.com

ip_cidr_set:
- 100.66.1.0/24

dest_port_set:
- '60000'
```

当前文件说明：

- `egern/direct.yaml`：对应直连分流规则。
- `egern/proxy.yaml`：对应代理分流规则。
- `egern/crypto.yaml`：对应加密货币相关分流规则。
- `egern/emby-direct.yaml`：对应 Emby 直连线路规则。
- `egern/emby-bypass-japan.yaml`：对应 Emby 绕日本线路规则。
- `egern/emby-proxy.yaml`：对应 Emby 代理线路规则。
- `egern/krak.yaml`：对应 Krak/Kraken 代理分流规则。
- `egern/copilot.yaml`：对应 Microsoft Copilot 代理分流规则。

## 英国 Wi-Fi Calling

`wificalling-uk.yaml`、`egern/wificalling-uk.yaml`、`loon/wificalling-uk.list` 和 `surge/wificalling-uk.list` 转换自 [LOWERTOP/Shadowrocket-First](https://github.com/LOWERTOP/Shadowrocket-First) 的 WiFiCallingUK 规则。使用时将规则集指向支持 UDP 转发的英国节点；Clash/Mihomo 使用 `classical` 格式，Loon 的逻辑规则需要 3.1.7 或更高版本。上游规则只适用于部分英国 SIM 卡。

Egern 规则集暂不包含上游的「英国 IP 且 UDP 目标端口为 500 或 4500」组合条件：官方文档列出了 `and_set`，但没有给出可验证的规则集语法。需要此条件时，在 Egern 主配置的 `rules` 中另外添加以下规则，`policy` 改成自己的英国节点或策略组，并放在可能提前匹配的规则之前：

```yaml
- and:
    match:
    - geoip:
        match: GB
    - protocol:
        match: udp
    - dest_port:
        match: "500,4500"
    policy: UK
```

这条主配置规则与 Egern 规则集要指向同一英国策略。规则集中的 IP-CIDR 使用 `no_resolve: true`；上面的 GeoIP 条件按上游规则不加 `no_resolve`。

## 维护约定

- 新增或更新根目录 Clash/Mihomo `.yaml` 规则时，必须同步更新 `egern/` 下的对应文件。
- 同步到 Egern 时要做格式转换：`DOMAIN-SUFFIX` → `domain_suffix_set`，`DOMAIN` → `domain_set`，`DOMAIN-KEYWORD` → `domain_keyword_set`，`IP-CIDR` → `ip_cidr_set`，`DST-PORT` → `dest_port_set`。
- 域名类规则优先使用 `DOMAIN-SUFFIX` / `domain_suffix_set`。
- 从 URL 添加规则时，只保留域名，去掉协议、端口和路径。
