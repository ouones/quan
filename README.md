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
- `emby-direct.yaml`：Emby 直连线路规则。
- `emby-bypass-japan.yaml`：Emby 绕日本线路规则。
- `emby-proxy.yaml`：Emby 代理线路规则。
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

## 维护约定

- 新增或更新根目录 Clash/Mihomo `.yaml` 规则时，必须同步更新 `egern/` 下的对应文件。
- 同步到 Egern 时要做格式转换：`DOMAIN-SUFFIX` → `domain_suffix_set`，`DOMAIN` → `domain_set`，`DOMAIN-KEYWORD` → `domain_keyword_set`，`IP-CIDR` → `ip_cidr_set`，`DST-PORT` → `dest_port_set`。
- 域名类规则优先使用 `DOMAIN-SUFFIX` / `domain_suffix_set`。
- 从 URL 添加规则时，只保留域名，去掉协议、端口和路径。
