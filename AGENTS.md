# AGENTS.md

## 适用范围

本仓库维护 Clash/Mihomo、Egern、Loon 分流规则，以及少量模块和脚本配置。

## 规则文件格式

- 根目录多数 `.yaml` 文件面向 Clash / Mihomo / OpenClash，使用 `payload:`：

  ```yaml
  payload:
    - DOMAIN-SUFFIX,example.com
  ```

- `egern/` 下的对应文件面向 Egern；按规则类型拆分为集合，不使用 `payload:`：

  ```yaml
  domain_suffix_set:
  - example.com
  ```

- `loon/` 下的 `.list` 文件是 Loon 订阅规则，每行一条规则，不使用 `payload:`，策略由订阅时指定：

  ```text
  DOMAIN-SUFFIX,example.com
  ```

  官方文档：[域名规则](https://nsloon.app/docs/Rule/domain_rule)、[IP 规则](https://nsloon.app/docs/Rule/ip_rule)、[端口规则](https://nsloon.app/docs/Rule/port_rule)、[订阅规则](https://nsloon.app/docs/Rule/sub_rule)。

## 维护规则

1. 新增或更新根目录 Clash/Mihomo `.yaml` 规则时，必须同步更新 `egern/` 和 `loon/` 下的对应规则文件。
2. 同步到 Egern 时，按以下映射转换规则类型：
   - `DOMAIN-SUFFIX` → `domain_suffix_set`
   - `DOMAIN` → `domain_set`
   - `DOMAIN-KEYWORD` → `domain_keyword_set`
   - `IP-CIDR` → `ip_cidr_set`
   - `DST-PORT` → `dest_port_set`
3. 域名规则优先使用 `DOMAIN-SUFFIX`；Egern 对应使用 `domain_suffix_set`。
4. 从 URL 提取规则时，只保留域名，移除协议、端口和路径。
5. 提交前确认根目录 YAML 与 `egern/`、`loon/` 对应文件的规则语义一致，且无重复规则。
6. `surge/` 下所有 `.list` 文件中的 `IP-CIDR` 和 `IP-CIDR6` 规则必须添加 `no-resolve`。
7. 同步到 Loon 时，保留规则顺序和匹配语义；`DOMAIN`、`DOMAIN-SUFFIX`、`DOMAIN-KEYWORD`、`IP-CIDR` 原样转换，`DST-PORT` 转为 `DEST-PORT`。Loon 端口规则需要 3.1.7 或以上版本。IP 规则仅在源规则明确指定时添加 `no-resolve`，避免改变 DNS 解析行为。
